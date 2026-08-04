import {
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;
let initialized = false;

export const tracer = trace.getTracer("invoice-agent");

export const initTracing = () => {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.OVERMIND_API_KEY;
  if (!apiKey) return;

  const baseUrl =
    process.env.OVERMIND_TRACES_URL || "https://api.overmindlab.ai";

  const exporter = new OTLPTraceExporter({
    url: `${baseUrl}/api/v1/traces`,
    headers: { "X-Api-Key": apiKey },
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "invoice-agent",
      "overmind.agent.name": "Ledgerline Invoice Triage Agent",
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  sdk.start();
};

export const shutdownTracing = async () => {
  await sdk?.shutdown();
};

export const withSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs?: Attributes,
): Promise<T> =>
  tracer.startActiveSpan(name, async (span) => {
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value !== undefined) span.setAttribute(key, value);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
