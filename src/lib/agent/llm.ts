import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { z } from "zod";
import { ensureTracingInit, tracer } from "@/lib/tracing";

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

const SYSTEM_PROMPT = `You are Ledgerline, an accounting invoice triage agent.
You ONLY decide from email content whether the message is a payable invoice / bill for accounting, and extract structured fields.

Rules:
- isInvoice=true only for unpaid/payable invoices, bills, or statements with an amount owed.
- isInvoice=false for receipts already paid, marketing, newsletters, personal chat, shipping notices without a bill, and unrelated mail.
- amount must be the total amount due (number only, no currency symbols).
- currency must be an ISO code like USD, GBP, EUR when known.
- dueDate must be YYYY-MM-DD when known, else null.
- Prefer explicit "amount due" / "total" / "balance due" over subtotals or tax lines.
- If uncertain whether it is a payable invoice, set isInvoice=false unless evidence is strong.

Confidence (required):
- Grade confidence from 0.0 to 1.0 on how sure you are that your full extraction is correct
  (isInvoice decision + extracted fields that you populated).
- Use a decimal in [0, 1], never a percentage (e.g. 0.82 not 82).
- Calibrate roughly as:
  - 0.90–1.00: clear payable invoice (or clear non-invoice) with explicit amount/due date or unambiguous rejection cues
  - 0.70–0.89: likely correct, but a field is missing, ambiguous, or inferred
  - 0.40–0.69: mixed signals (receipt vs invoice, partial bill, weak vendor/amount evidence)
  - 0.00–0.39: guessing; content is sparse, contradictory, or mostly unrelated
- Lower confidence when amount/due date/vendor are guessed, when paid receipts look like invoices, or when multiple totals conflict.
- Higher confidence when the email explicitly says invoice/bill/amount due and fields are stated plainly.
- Do not default every answer to 0.9+; spread scores when evidence strength differs.

Return JSON only. No markdown.`;

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

const toGenAiMessages = (messages: Array<{ role: string; content: string }>) =>
  JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      parts: [{ type: "text", content: message.content }],
    })),
  );

export const analyzeEmailWithLlm = async (input: {
  subject: string;
  from: string;
  date: string;
  text: string;
}): Promise<LlmExtraction> => {
  ensureTracingInit();
  const entrySpan = tracer.startSpan("Ledgerline Invoice Triage Agent");
  entrySpan.setAttribute("overmind.input.data", JSON.stringify(input));

  try {
  const endpoint = getLlmEndpoint();
  const temperature = 0;

  const userPrompt = `Analyze this email for accounting invoice triage.

Return ONLY valid JSON with exactly these keys:
{
  "isInvoice": boolean,
  "vendor": string|null,
  "amount": number|null,
  "currency": string|null,
  "dueDate": "YYYY-MM-DD"|null,
  "invoiceNumber": string|null,
  "summary": string|null,
  "confidence": number
}

For "confidence": score 0.0–1.0 for how confident you are in this triage + extraction
(not how likely the email is an invoice by itself). Example: a clear newsletter can be
isInvoice=false with confidence 0.95; a blurry maybe-invoice might be isInvoice=false
with confidence 0.45.

Email date: ${input.date}
Email subject: ${input.subject}
From: ${input.from}
Body / attachments text:
${input.text.slice(0, 10000)}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const llmSpan = tracer.startSpan(
    "llm_call",
    undefined,
    trace.setSpan(context.active(), entrySpan),
  );
  llmSpan.setAttribute(
    "gen_ai.system",
    endpoint.provider === "openai" ? "openai" : "ollama",
  );
  llmSpan.setAttribute("gen_ai.request.model", endpoint.model);
  llmSpan.setAttribute("gen_ai.request.temperature", temperature);
  llmSpan.setAttribute("gen_ai.request.response_format", "json_object");
  llmSpan.setAttribute("gen_ai.input.messages", toGenAiMessages(messages));

  let rawContent: string;
  try {
  const response = await context.with(
    trace.setSpan(context.active(), llmSpan),
    async () =>
      fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify({
          model: endpoint.model,
          temperature,
          messages,
          response_format: { type: "json_object" },
        }),
      }),
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `LLM request failed (${response.status}): ${errorText.slice(0, 240) || response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  if (data.usage?.prompt_tokens != null) {
    llmSpan.setAttribute(
      "gen_ai.usage.prompt_tokens",
      data.usage.prompt_tokens,
    );
  }
  if (data.usage?.completion_tokens != null) {
    llmSpan.setAttribute(
      "gen_ai.usage.completion_tokens",
      data.usage.completion_tokens,
    );
  }

  rawContent = data.choices?.[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("LLM returned an empty response.");
  }

  llmSpan.setAttribute(
    "gen_ai.output.messages",
    JSON.stringify([
      {
        role: "assistant",
        parts: [{ type: "text", content: rawContent }],
      },
    ]),
  );
  } catch (err) {
    llmSpan.recordException(err as Error);
    llmSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    llmSpan.end();
  }

  const parsed = extractJsonObject(rawContent) as Record<string, unknown>;

  // Some models return confidence as 0–100; normalize to 0–1 for the schema.
  if (typeof parsed.confidence === "number" && parsed.confidence > 1) {
    parsed.confidence = Math.min(parsed.confidence / 100, 1);
  }

  const result = LlmExtractionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `LLM returned invalid invoice JSON: ${result.error.message}`,
    );
  }

  entrySpan.setAttribute("overmind.output.data", JSON.stringify(result.data));
  return result.data;
  } catch (err) {
    entrySpan.recordException(err as Error);
    entrySpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    entrySpan.end();
  }
};
