import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

let provider: NodeTracerProvider | null = null;
let initialized = false;

export const initTelemetry = () => {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.OVERMIND_API_KEY;
  if (!apiKey) return;

  const baseUrl = (
    process.env.OVERMIND_TRACES_URL || "https://api.overmindlab.ai"
  ).replace(/\/$/, "");

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      "service.name": "ledgerline-invoice-triage",
      "overmind.agent.name": "Ledgerline Invoice Triage Agent",
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${baseUrl}/api/v1/traces`,
          headers: { "X-Api-Key": apiKey },
        }),
      ),
    ],
  });

  provider.register();

  process.on("beforeExit", () => {
    void shutdownTelemetry();
  });
};

export const getTracer = () => trace.getTracer("ledgerline-invoice-triage");

export const shutdownTelemetry = async () => {
  if (!provider) return;
  await provider.shutdown();
  provider = null;
};
