import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const TRACER_NAME = "ledgerline-invoice-triage";
const AGENT_NAME = "Ledgerline Invoice Triage Agent";
const APP_NAME = "invoice-agent";

let initialized = false;
let sdk: NodeSDK | null = null;

/**
 * Init OTLP export to Overmind.
 *
 * NOTE: @overmind-lab/trace-sdk@0.0.6 posts to `/api/v1/traces/create` with
 * `X-API-TOKEN`, which 404s. Official ingest is:
 *   POST {base}/api/v1/traces
 *   Header: X-Api-Key: <OVERMIND_API_KEY>
 * so we wire the exporter ourselves.
 */
export const ensureOvermindTracing = () => {
  if (initialized || !process.env.OVERMIND_API_KEY) return;
  initialized = true;

  const baseUrl = (
    process.env.OVERMIND_TRACES_URL || "https://api.overmindlab.ai"
  ).replace(/\/$/, "");

  const exporter = new OTLPTraceExporter({
    url: `${baseUrl}/api/v1/traces`,
    headers: {
      "X-Api-Key": process.env.OVERMIND_API_KEY,
    },
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: APP_NAME,
      [ATTR_SERVICE_VERSION]: "0.1.0",
      "deployment.environment":
        process.env.DEPLOYMENT_ENVIRONMENT || "development",
      "overmind.sdk.name": "invoice-agent-direct-otlp",
      "overmind.sdk.version": "0.1.0",
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  sdk.start();
};

/** Flush + tear down the SDK. Call before CLI process.exit. */
export const shutdownOvermindTracing = async () => {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = null;
  initialized = false;
};

type SpanType = "entry_point" | "function" | "llm_call";

/**
 * Stamp Overmind harness I/O.
 *
 * Overmind's normalizer only picks these keys (in order):
 *   input:  overmind.input.data | overmind.input_data | traceloop.entity.input | inputs
 *   output: overmind.output.data | overmind.output_data | traceloop.entity.output | outputs
 * Plain `input` / `output` are ignored for trajectory reconstruction.
 */
export const stampSpanInput = (
  span: Span,
  input: Record<string, unknown>,
) => {
  const payload = JSON.stringify(input);
  span.setAttribute("overmind.input.data", payload);
  span.setAttribute("inputs", payload);
};

export const stampSpanOutput = (
  span: Span,
  output: Record<string, unknown> | null,
) => {
  const payload = JSON.stringify(output);
  span.setAttribute("overmind.output.data", payload);
  span.setAttribute("outputs", payload);
};

/** ChatML `{role,content}` → OTel GenAI parts-based messages Overmind parses. */
export const toGenAiPartsMessages = (
  messages: Array<{ role: string; content: string }>,
) =>
  JSON.stringify(
    messages.map((m) => ({
      role: m.role,
      parts: [{ type: "text", content: m.content }],
    })),
  );

/**
 * startActiveSpan helper that always ends the span (Gap 1).
 */
export const withSpan = async <T>(
  name: string,
  spanType: SpanType,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  ensureOvermindTracing();
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("overmind.span.type", spanType);
    span.setAttribute("overmind.agent.name", AGENT_NAME);
    for (const [key, value] of Object.entries(attrs)) {
      span.setAttribute(key, value);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
};
