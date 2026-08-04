import { trace } from "@opentelemetry/api";
import { analyzeEmailWithLlm } from "@/lib/agent/llm";
import { generateDemoEmails } from "@/lib/generate-demo-emails";
import type { RawEmail } from "@/lib/gmail";
import { withEntryPointSpan, withLlmCallSpan } from "@/lib/telemetry";
import type { InvoiceRecord } from "@/lib/types";

/**
 * Intended failure / shape tags for the themes corpus.
 * Stored only in a local id→mode map (never stamped on OTEL spans).
 */
export type ThemeFailureMode =
  | "ok"
  | "missing_amount"
  | "missing_due_date"
  | "currency_confusion"
  | "false_positive"
  | "false_negative"
  | "post_llm_error"
  | "llm_call_error"
  | "oddball";

export type ThemesCorpusItem = {
  email: RawEmail;
  mode: ThemeFailureMode;
};

export type ThemesAnalyzeResult = {
  emailId: string;
  mode: ThemeFailureMode;
  traceId: string | null;
  ok: boolean;
  isInvoice: boolean;
  error: string | null;
  record: InvoiceRecord | null;
};

const FAMILY = (index: number) => {
  const bucket = index % 20;
  if (bucket < 9) return "invoice" as const;
  if (bucket < 13) return "receipt" as const;
  if (bucket < 16) return "personal" as const;
  if (bucket < 18) return "newsletter" as const;
  return "shipping" as const;
};

/** Deterministic pick of `count` indices from `pool` (sorted for stability). */
const pickIndices = (pool: number[], count: number, salt: number): number[] => {
  if (count <= 0 || pool.length === 0) return [];
  const scored = pool.map((idx) => ({
    idx,
    rank: ((idx * 2654435761 + salt * 40503) >>> 0) % 1_000_003,
  }));
  scored.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
  return scored.slice(0, Math.min(count, scored.length)).map((s) => s.idx);
};

const ODDBALLS: RawEmail[] = [
  {
    id: "themes-oddball-dispute",
    threadId: "themes-oddball-dispute",
    subject: "Formal dispute — INV-4419 overcharged labour hours",
    from: "Legal <disputes@ledgerline-ap.example>",
    date: "Mon, 06 Jul 2026 09:00:00 +0000",
    snippet: "We dispute line 3; please hold payment",
    bodyText: `
We formally dispute invoice INV-4419 from Brightline Telecom.

Line 3 (after-hours labour) was never authorised. Please place the invoice
on hold and confirm a credit memo. This is a dispute letter, not a payment
instruction.
`.trim(),
    attachmentTexts: [],
  },
  {
    id: "themes-oddball-partial-refund",
    threadId: "themes-oddball-partial-refund",
    subject: "Partial refund processed — RMA-882",
    from: "Returns <returns@novadesign.example>",
    date: "Tue, 07 Jul 2026 11:22:00 +0000",
    snippet: "€120.00 credited to original card",
    bodyText: `
Partial refund note for RMA-882.

Original invoice: ND-2104
Refunded: €120.00 of €480.00 (damaged goods)
Method: original card ending 4412

No amount is due. This confirms a credit already issued.
`.trim(),
    attachmentTexts: [],
  },
  {
    id: "themes-oddball-dunning-de",
    threadId: "themes-oddball-dunning-de",
    subject: "Zweite Mahnung — offene Rechnung RG-7781",
    from: "Buchhaltung <mahnung@cloudhost.example>",
    date: "Wed, 08 Jul 2026 08:15:00 +0000",
    snippet: "Bitte überweisen Sie 890,00 EUR bis 16.07.2026",
    bodyText: `
Sehr geehrte Damen und Herren,

dies ist die zweite Mahnung zu Rechnung RG-7781.

Offener Betrag: 890,00 EUR
Fällig spätestens: 16.07.2026
Verwendungszweck: RG-7781

Bitte begleichen Sie den Betrag unverzüglich, um weitere Schritte zu vermeiden.
`.trim(),
    attachmentTexts: [],
  },
  {
    id: "themes-oddball-scan-only",
    threadId: "themes-oddball-scan-only",
    subject: "Scanned cafe receipt (image OCR dump)",
    from: "Expenses <expenses@ledgerline.example>",
    date: "Thu, 09 Jul 2026 17:40:00 +0000",
    snippet: "OCR from phone photo — barely readable",
    bodyText: `
Attached OCR dump from a phone photo of a paper receipt.
Body has no structured fields; only the attachment text may contain totals.
`.trim(),
    attachmentTexts: [
      `
=== OCR (low confidence) ===
CAFE LUMEN
t0tal ?? 14.5O
dte: 0?/1?/26
card ****9912
PAID
===========================
`.trim(),
    ],
  },
];

const pathologize = (email: RawEmail, mode: ThemeFailureMode, index: number): RawEmail => {
  if (mode === "ok" || mode === "llm_call_error" || mode === "post_llm_error") {
    return email;
  }

  if (mode === "missing_amount") {
    return {
      ...email,
      subject: `Invoice details for ${email.subject.replace(/^Invoice\s+/i, "")}`,
      snippet: "Please review the attached schedule — totals omitted from body",
      bodyText: `
${email.from.split("<")[0].trim() || "Vendor"}

Payable invoice — field schedule attached.

Vendor confirmed. Payment terms: due on receipt of funds clearance.
Amount due: [see attachment page 2 — not included in this text extract]
Due date: July ${(index % 20) + 10}, 2026
Invoice ref: PATH-AMT-${1000 + index}

The body intentionally omits a numeric total.
`.trim(),
      attachmentTexts: [
        `Schedule page 1 only.\nNo grand total printed on the extracted page.\nSubline items redacted.\n`,
      ],
    };
  }

  if (mode === "missing_due_date") {
    return {
      ...email,
      snippet: "Amount due listed; due date written as net-30 only",
      bodyText: `
Payable invoice

Amount due: $${(40 + (index % 900) + (index % 10) / 10).toFixed(2)} USD
Payment terms: net 30 from receipt (no calendar due date stated)
Invoice number: PATH-DUE-${1000 + index}

Please remit per standard net-30 terms.
`.trim(),
      attachmentTexts: [],
    };
  }

  if (mode === "currency_confusion") {
    // European formatting + conflicting $ cues — model often emits USD.
    const whole = 1000 + (index % 800);
    const frac = String((index * 7) % 100).padStart(2, "0");
    return {
      ...email,
      snippet: `Betrag ${whole},${frac} EUR (also shows $ glyph in footer)`,
      bodyText: `
RECHNUNG / INVOICE PATH-CUR-${1000 + index}

Rechnungsbetrag: ${whole},${frac} EUR
(Anzeige in Portal manchmal als $${whole}.${frac})

Fällig: ${(index % 20) + 10}.07.2026

Bitte überweisen Sie den EUR-Betrag. Ignore any $ decorative glyph in the footer.
Footer: prices may display with a $ icon in our US template — currency is EUR.
`.trim(),
      attachmentTexts: [],
    };
  }

  if (mode === "false_positive") {
    return {
      ...email,
      subject: `Action required: account review #${index + 1}`,
      snippet: "Exclusive offer — upgrade before Friday",
      bodyText: `
Weekly Partner Digest

Unlock Pro analytics this week.
Many customers ask about "invoice-like" upgrade confirmations.

Promo code SAVE20 — not a bill.
Estimated list price if you upgraded: $49/mo (marketing only).

Unsubscribe | This is a newsletter, not an accounts-payable invoice.
`.trim(),
      // Bait: invoice-ish wording without being a real payable invoice.
      attachmentTexts: [
        `Upgrade quote (not payable):\nVendor: Growth Lab\nQuoted: 49.00 USD\n`,
      ],
    };
  }

  if (mode === "false_negative") {
    return {
      ...email,
      subject: `Informational copy of statement ST-${1000 + index}`,
      snippet: "FYI statement attached — accounting copy",
      bodyText: `
INFORMATIONAL — for your records

Some portals label this "do not pay online" because payment is via ACH only.
This IS a payable invoice / bill for accounting.

Vendor: Orbit Analytics
Amount due: $${(120 + (index % 400)).toFixed(2)} USD
Due date: July ${(index % 15) + 12}, 2026
Invoice: ST-${1000 + index}

Remit by ACH using the amount and due date above.
`.trim(),
      attachmentTexts: [],
    };
  }

  return email;
};

/**
 * Build a deterministic themes corpus on top of the standard family mix.
 * Existing `generateDemoEmails` output is unchanged — this wraps it.
 */
export const generateThemesCorpus = (
  count = 1200,
): { items: ThemesCorpusItem[]; modeByEmailId: Map<string, ThemeFailureMode> } => {
  if (count < 500) {
    throw new Error("themes corpus count must be >= 500 (platform learns on first 500)");
  }

  const base = generateDemoEmails(count);
  const modes: ThemeFailureMode[] = Array.from({ length: count }, () => "ok");

  const invoiceIdx: number[] = [];
  const baitIdx: number[] = []; // receipt + newsletter for false_positive
  for (let i = 0; i < count - 4; i += 1) {
    const family = FAMILY(i);
    if (family === "invoice") invoiceIdx.push(i);
    if (family === "receipt" || family === "newsletter") baitIdx.push(i);
  }

  const assign = (pool: number[], mode: ThemeFailureMode, n: number, salt: number) => {
    for (const idx of pickIndices(pool, n, salt)) {
      modes[idx] = mode;
    }
  };

  // ~30% failures across targeted families (exact counts).
  assign(invoiceIdx, "missing_amount", 60, 11);
  assign(
    invoiceIdx.filter((i) => modes[i] === "ok"),
    "missing_due_date",
    60,
    22,
  );
  assign(
    invoiceIdx.filter((i) => modes[i] === "ok"),
    "currency_confusion",
    60,
    33,
  );
  assign(
    invoiceIdx.filter((i) => modes[i] === "ok"),
    "false_negative",
    40,
    44,
  );
  assign(
    invoiceIdx.filter((i) => modes[i] === "ok"),
    "post_llm_error",
    30,
    55,
  );
  assign(
    invoiceIdx.filter((i) => modes[i] === "ok"),
    "llm_call_error",
    20,
    66,
  );
  assign(baitIdx.filter((i) => modes[i] === "ok"), "false_positive", 60, 77);

  // Last four slots are unique oddballs (should land in "Other").
  for (let k = 0; k < 4; k += 1) {
    const idx = count - 4 + k;
    modes[idx] = "oddball";
    base[idx] = { ...ODDBALLS[k], id: `gen-${idx + 1}`, threadId: `gen-thread-${idx + 1}` };
  }

  const items: ThemesCorpusItem[] = base.map((email, index) => {
    const mode = modes[index];
    const shaped =
      mode === "oddball" ? email : pathologize(email, mode, index);
    return { email: shaped, mode };
  });

  const modeByEmailId = new Map<string, ThemeFailureMode>();
  for (const item of items) {
    modeByEmailId.set(item.email.id, item.mode);
  }

  return { items, modeByEmailId };
};

const toGmailUrl = (_emailId: string) => `#`;

/**
 * One email → one root entry_point. Applies themes failure hooks WITHOUT
 * writing false telemetry: corruptions happen in post-processing after a
 * real llm_call; errors throw so OTEL records real ERROR status.
 */
export const analyzeThemesEmail = async (
  item: ThemesCorpusItem,
): Promise<ThemesAnalyzeResult> => {
  let traceId: string | null = null;

  try {
    const record = await withEntryPointSpan(
      "analyzeEmail",
      { email: item.email, source: "demo" },
      async () => {
        traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;

        if (item.mode === "llm_call_error") {
          // Provider failure before any assistant output — llm_call errors, no answer.
          await withLlmCallSpan(
            {
              name: "analyzeEmailWithLlm",
              model: process.env.OPENAI_MODEL || process.env.OLLAMA_MODEL || "gpt-4o-mini",
              provider: process.env.OPENAI_API_KEY ? "openai" : "ollama",
              messages: [
                { role: "system", content: "themes corpus" },
                { role: "user", content: item.email.subject },
              ],
              temperature: 0,
            },
            async () => {
              throw new Error(
                "Simulated provider failure before output (themes corpus llm_call_error)",
              );
            },
          );
          return null;
        }

        const combinedText = [
          item.email.subject,
          item.email.snippet,
          item.email.bodyText,
          ...item.email.attachmentTexts,
        ]
          .filter(Boolean)
          .join("\n");

        const llm = await analyzeEmailWithLlm({
          subject: item.email.subject,
          from: item.email.from,
          date: item.email.date,
          text: combinedText,
        });

        // Honest post-processing corruptions (after llm_call recorded its output).
        let isInvoice = llm.isInvoice;
        let amount = llm.amount;
        let currency = llm.currency;
        let dueDate = llm.dueDate;
        let vendor = llm.vendor;

        if (item.mode === "missing_amount") {
          amount = null;
        }
        if (item.mode === "missing_due_date") {
          dueDate = null;
        }
        if (item.mode === "currency_confusion") {
          currency = "USD";
        }
        if (item.mode === "false_positive") {
          // Force payable classification in harness output when model declined.
          isInvoice = true;
          vendor = vendor || "Growth Lab";
          amount = amount ?? 49;
          currency = currency || "USD";
        }
        if (item.mode === "false_negative") {
          isInvoice = false;
        }

        if (item.mode === "post_llm_error") {
          // llm_call already succeeded with outputs; fail the entry_point after.
          throw new Error(
            "Due-date normalisation failed (themes corpus post_llm_error)",
          );
        }

        if (!isInvoice) return null;

        return {
          id: `demo-${item.email.id}`,
          emailId: item.email.id,
          threadId: item.email.threadId || undefined,
          subject: item.email.subject,
          from: item.email.from,
          vendor: vendor || "Unknown vendor",
          receivedAt: new Date(item.email.date).toISOString(),
          amount:
            amount != null
              ? {
                  value: amount,
                  currency: currency || "USD",
                  raw: `${currency || "USD"} ${amount}`,
                }
              : null,
          dueDate,
          invoiceNumber: llm.invoiceNumber,
          confidence: Number(llm.confidence.toFixed(2)),
          summary: llm.summary || item.email.snippet || item.email.subject,
          gmailUrl: toGmailUrl(item.email.id),
          source: "demo" as const,
        };
      },
    );

    return {
      emailId: item.email.id,
      mode: item.mode,
      traceId,
      ok: true,
      isInvoice: Boolean(record),
      error: null,
      record,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      emailId: item.email.id,
      mode: item.mode,
      traceId,
      ok: false,
      isInvoice: false,
      error: message,
      record: null,
    };
  }
};

export const tallyModes = (items: ThemesCorpusItem[]) => {
  const counts = new Map<ThemeFailureMode, number>();
  for (const item of items) {
    counts.set(item.mode, (counts.get(item.mode) || 0) + 1);
  }
  return counts;
};
