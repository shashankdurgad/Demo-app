import { context, trace, type Span, SpanStatusCode } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { OvermindClient } from "@overmind-lab/trace-sdk";

let provider: NodeTracerProvider | undefined;
let initialized = false;
let shutdownHooked = false;

export const tracer = trace.getTracer("invoice-agent");

export const initTracing = () => {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.OVERMIND_API_KEY;
  if (!apiKey) return;

  const client = new OvermindClient({
    apiKey,
    appName: "invoice-agent",
  });
  void client;

  const baseUrl =
    process.env.OVERMIND_TRACES_URL || "https://api.overmindlab.ai";

  const exporter = new OTLPTraceExporter({
    url: `${baseUrl}/api/v1/traces`,
    headers: { "X-Api-Key": apiKey },
  });

  const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor(exporter)];

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "invoice-agent",
      "overmind.agent.name": "Ledgerline Invoice Triage Agent",
    }),
    spanProcessors,
  });
  provider.register();

  if (typeof process !== "undefined" && !shutdownHooked) {
    shutdownHooked = true;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      void shutdownTracing().finally(() => {
        originalExit.call(process, code ?? 0);
      });
    }) as typeof process.exit;
  }
};

export const ensureTracingInit = () => {
  initTracing();
};

export const withSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentContext = context.active(),
): Promise<T> => {
  const span = tracer.startSpan(name, undefined, parentContext);
  try {
    return await context.with(trace.setSpan(parentContext, span), () => fn(span));
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
};

export const shutdownTracing = async () => {
  await provider?.shutdown();
};
