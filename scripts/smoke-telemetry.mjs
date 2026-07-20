process.env.OVERMIND_API_KEY = "test-key-not-real";
process.env.OVERMIND_AGENT_NAME = "invoice-agent-test";
process.env.OVERMIND_ENVIRONMENT = "development";
process.env.OPENAI_API_KEY = "test";
process.env.OPENAI_MODEL = "gpt-4o-mini";

import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { trace } from "@opentelemetry/api";

const memory = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  resource: resourceFromAttributes({
    "service.name": "invoice-agent",
    "deployment.environment": "development",
    "overmind.sdk.name": "overmind-otel-js",
    "overmind.sdk.version": "0.1.0",
    "overmind.agent.name": "invoice-agent-test",
  }),
  spanProcessors: [new SimpleSpanProcessor(memory)],
});
trace.setGlobalTracerProvider(provider);

// Provider is already registered — initTelemetry will skip NodeSDK/OTLP.
const telemetry = await import("../src/lib/telemetry.ts");
telemetry.initTelemetry();

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({
    model: "gpt-4o-mini",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            isInvoice: true,
            vendor: "Northwind",
            amount: 10,
            currency: "USD",
            dueDate: "2026-07-28",
            invoiceNumber: "AA-1",
            summary: "test",
            confidence: 0.9,
          }),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }),
});

const { analyzeEmail } = await import("../src/lib/agent/triage.ts");
const record = await analyzeEmail(
  {
    id: "demo-1",
    threadId: "t1",
    subject: "Invoice AA-1",
    from: "billing@example.com",
    date: "2026-07-16T00:00:00.000Z",
    snippet: "amount due",
    bodyText: "Please pay USD 10",
    attachmentTexts: [],
  },
  "demo",
);

await telemetry.flushTraces();

const spans = memory.getFinishedSpans();
const byType = Object.fromEntries(
  spans.map((s) => [s.attributes["overmind.span.type"], s]),
);

const entry = byType.entry_point;
const llm = byType.llm_call;

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(record?.vendor === "Northwind", "harness record missing");
assert(entry, "missing entry_point span");
assert(llm, "missing llm_call span");
assert(entry.attributes["overmind.status"] === "success", "entry status");
assert(typeof entry.attributes.inputs === "string", "entry inputs");
assert(typeof entry.attributes.outputs === "string", "entry outputs");
assert(JSON.parse(String(entry.attributes.outputs)).emailId === "demo-1", "harness output");

assert(typeof llm.attributes["gen_ai.input.messages"] === "string", "gen_ai.input.messages");
assert(typeof llm.attributes["overmind.input.data"] === "string", "overmind.input.data");
assert(typeof llm.attributes["gen_ai.output.messages"] === "string", "gen_ai.output.messages");
assert(typeof llm.attributes["overmind.output.data"] === "string", "overmind.output.data");
assert(String(llm.attributes["overmind.output.data"]).includes("isInvoice"), "raw has isInvoice");
assert(llm.attributes["genai.prompt_tokens"] === 100, "prompt tokens");
assert(llm.attributes["genai.completion_tokens"] === 50, "completion tokens");
assert(llm.attributes["genai.total_tokens"] === 150, "total tokens");
assert(typeof llm.attributes["genai.cost"] === "number", "cost derived");
assert(llm.attributes["genai.model"] === "gpt-4o-mini", "model");
assert(llm.attributes["gen_ai.usage.prompt_tokens"] === 100, "otel mirror");

// entry_point must be root of its own trace (one email = one datapoint)
assert(!entry.parentSpanContext, "entry_point should be root");
assert(
  llm.spanContext().traceId === entry.spanContext().traceId,
  "llm_call child of same trace",
);
assert(
  llm.parentSpanContext?.spanId === entry.spanContext().spanId,
  "llm parent is entry",
);

console.log("telemetry smoke passed:", {
  traces: 1,
  spans: spans.map((s) => s.attributes["overmind.span.type"]),
  cost: llm.attributes["genai.cost"],
});
