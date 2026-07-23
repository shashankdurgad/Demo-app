import { z } from "zod";
import { withLlmCallSpan } from "@/lib/telemetry";

const LlmExtractionSchema = z.object({
  isInvoice: z.boolean(),
  vendor: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  dueDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;

const ClassifySchema = z.object({
  isInvoice: z.boolean(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const ExtractSchema = z.object({
  vendor: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  dueDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const RejectSchema = z.object({
  vendor: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const FinalizeSchema = z.object({
  apNote: z.string().min(1),
});

export type LlmEndpoint = {
  provider: "openai" | "ollama";
  url: string;
  model: string;
  headers: Record<string, string>;
};

export const isLlmConfigured = () =>
  Boolean(process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL);

export const requireLlmConfigured = () => {
  if (isLlmConfigured()) return;
  throw new Error(
    "LLM is required. Set OPENAI_API_KEY (or OLLAMA_BASE_URL for a local model) in .env.local, then restart the app.",
  );
};

export const getLlmEndpoint = (): LlmEndpoint => {
  requireLlmConfigured();

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      url:
        process.env.OPENAI_BASE_URL ||
        "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    };
  }

  const base = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );

  return {
    provider: "ollama",
    url: `${base}/v1/chat/completions`,
    model: process.env.OLLAMA_MODEL || "llama3.2",
    headers: { "Content-Type": "application/json" },
  };
};

export const getLlmStatus = () => {
  if (!isLlmConfigured()) {
    return { configured: false as const, provider: null, model: null };
  }

  const endpoint = getLlmEndpoint();
  return {
    configured: true as const,
    provider: endpoint.provider,
    model: endpoint.model,
  };
};

type EmailInput = {
  subject: string;
  from: string;
  date: string;
  text: string;
};

const emailBlock = (input: EmailInput) =>
  `Email date: ${input.date}
Email subject: ${input.subject}
From: ${input.from}
Body / attachments text:
${input.text.slice(0, 8000)}`;

const extractJsonObject = (content: string) => {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed) as unknown;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM did not return JSON.");
  }
  return JSON.parse(match[0]) as unknown;
};

const normalizeConfidence = (parsed: Record<string, unknown>) => {
  if (typeof parsed.confidence === "number" && parsed.confidence > 1) {
    parsed.confidence = Math.min(parsed.confidence / 100, 1);
  }
};

const callLlmJson = async <T>(
  spanName: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const endpoint = getLlmEndpoint();
  const temperature = 0;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  return withLlmCallSpan(
    {
      name: spanName,
      model: endpoint.model,
      provider: endpoint.provider,
      messages,
      temperature,
    },
    async () => {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify({
          model: endpoint.model,
          temperature,
          messages,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `LLM request failed (${response.status}): ${errorText.slice(0, 240) || response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error("LLM returned an empty response.");
      }

      const parsed = extractJsonObject(rawContent) as Record<string, unknown>;
      normalizeConfidence(parsed);

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          `LLM returned invalid JSON for ${spanName}: ${result.error.message}`,
        );
      }

      return {
        result: result.data,
        rawContent,
        usage: data.usage,
        responseModel: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
      };
    },
  );
};

/** Step 1 — payable-invoice triage (always). */
const classifyEmailWithLlm = (input: EmailInput) =>
  callLlmJson(
    "classifyEmailWithLlm",
    `You triage email for accounts payable. Return JSON only.
isInvoice=true only for unpaid/payable invoices or bills with an amount owed.
isInvoice=false for receipts, marketing, personal mail, shipping notices, etc.
Keep summary to one short sentence. confidence is 0.0–1.0.`,
    `Classify this email.

Return ONLY JSON:
{"isInvoice":boolean,"summary":string|null,"confidence":number}

${emailBlock(input)}`,
    ClassifySchema,
  );

/** Step 2a — field extraction when classify says invoice. */
const extractInvoiceFieldsWithLlm = (input: EmailInput) =>
  callLlmJson(
    "extractInvoiceFieldsWithLlm",
    `Extract payable-invoice fields. Return JSON only.
amount = total due (number). currency = ISO code. dueDate = YYYY-MM-DD or null.
confidence is 0.0–1.0 for the extraction.`,
    `Extract invoice fields from this email (already classified as a payable invoice).

Return ONLY JSON:
{"vendor":string|null,"amount":number|null,"currency":string|null,"dueDate":"YYYY-MM-DD"|null,"invoiceNumber":string|null,"summary":string|null,"confidence":number}

${emailBlock(input)}`,
    ExtractSchema,
  );

/** Step 2b — rejection rationale when classify says non-invoice (keeps a 2nd llm_call). */
const explainRejectionWithLlm = (input: EmailInput, classifySummary: string | null) =>
  callLlmJson(
    "explainRejectionWithLlm",
    `Explain why this email is not a payable invoice. Return JSON only.
All invoice fields must be null. rationale = short rejection reason. confidence 0.0–1.0.`,
    `This email was classified as NOT a payable invoice (triage summary: ${classifySummary || "n/a"}).
Confirm rejection and explain briefly.

Return ONLY JSON:
{"vendor":null,"amount":null,"currency":null,"dueDate":null,"invoiceNumber":null,"summary":string|null,"confidence":number,"rationale":string}

${emailBlock(input)}`,
    RejectSchema,
  );

/** Step 3 — brief AP note / next action (always). */
const finalizeApNoteWithLlm = (
  input: EmailInput,
  draft: {
    isInvoice: boolean;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    summary: string | null;
    rationale?: string;
  },
) =>
  callLlmJson(
    "finalizeApNoteWithLlm",
    `Write a 1–2 sentence AP clerk note. Return JSON only: {"apNote":string}.
Be concise. No markdown.`,
    `Draft a short AP note / next action for this email.

Context:
- isInvoice: ${draft.isInvoice}
- vendor: ${draft.vendor}
- amount: ${draft.amount} ${draft.currency || ""}
- dueDate: ${draft.dueDate}
- summary: ${draft.summary}
- rejection: ${draft.rationale || "n/a"}

Subject: ${input.subject}
From: ${input.from}

Return ONLY JSON: {"apNote":string}`,
    FinalizeSchema,
  );

/**
 * Fixed 3-step LLM pipeline under the caller's entry_point context:
 * classify → extract | explainRejection → finalize.
 * Every email produces 3 nested llm_call spans (for Overmind multi-call scoring).
 */
export const analyzeEmailWithLlm = async (
  input: EmailInput,
): Promise<LlmExtraction> => {
  const classified = await classifyEmailWithLlm(input);

  let vendor: string | null = null;
  let amount: number | null = null;
  let currency: string | null = null;
  let dueDate: string | null = null;
  let invoiceNumber: string | null = null;
  let summary = classified.summary;
  let confidence = classified.confidence;
  let rationale: string | undefined;

  if (classified.isInvoice) {
    const extracted = await extractInvoiceFieldsWithLlm(input);
    vendor = extracted.vendor;
    amount = extracted.amount;
    currency = extracted.currency;
    dueDate = extracted.dueDate;
    invoiceNumber = extracted.invoiceNumber;
    summary = extracted.summary ?? classified.summary;
    confidence = extracted.confidence;
  } else {
    const rejected = await explainRejectionWithLlm(input, classified.summary);
    summary = rejected.summary ?? classified.summary;
    confidence = rejected.confidence;
    rationale = rejected.rationale;
  }

  const finalized = await finalizeApNoteWithLlm(input, {
    isInvoice: classified.isInvoice,
    vendor,
    amount,
    currency,
    dueDate,
    summary,
    rationale,
  });

  // Prefer finalize note in summary when present; keeps harness shape unchanged.
  const assembled = {
    isInvoice: classified.isInvoice,
    vendor,
    amount,
    currency,
    dueDate,
    invoiceNumber,
    summary: finalized.apNote || summary,
    confidence,
  };

  return LlmExtractionSchema.parse(assembled);
};
