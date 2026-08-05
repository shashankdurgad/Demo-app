import {
  trace,
  SpanStatusCode,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const AGENT_NAME = "Ledgerline Invoice Triage Agent";
const SERVICE_NAME = "ledgerline-invoice-agent";

let initialized = false;
let provider: BasicTracerProvider | null = null;

const isTelemetryEnabled = () => Boolean(process.env.OVERMIND_API_KEY);

const initTelemetry = () => {
  if (initialized || !isTelemetryEnabled()) return;
  initialized = true;

  const baseUrl =
    process.env.OVERMIND_TRACES_URL || "https://api.overmindlab.ai";

  provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      "overmind.agent.name": AGENT_NAME,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${baseUrl.replace(/\/$/, "")}/api/v1/traces`,
          headers: { "X-Api-Key": process.env.OVERMIND_API_KEY! },
        }),
      ),
    ],
  });

  trace.setGlobalTracerProvider(provider);
};

const forceFlush = async () => {
  if (provider) await provider.forceFlush();
};

const setSpanError = (span: Span, err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
};

const toGenAiMessages = (
  messages: Array<{ role: string; content: string }>,
) =>
  JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      parts: [{ type: "text", content: message.content }],
    })),
  );

export const traceEntryPoint = <TInput, TOutput>(
  name: string,
  fn: (input: TInput) => Promise<TOutput>,
  toHarnessInput: (input: TInput) => unknown,
) => {
  return async (input: TInput): Promise<TOutput> => {
    if (!isTelemetryEnabled()) return fn(input);

    initTelemetry();
    const tracer = trace.getTracer(SERVICE_NAME);

    return tracer.startActiveSpan(name, async (span) => {
      span.setAttribute("overmind.span.type", "entry_point");
      span.setAttribute(
        "overmind.input.data",
        JSON.stringify(toHarnessInput(input)),
      );

      try {
        const output = await fn(input);
        span.setAttribute("overmind.output.data", JSON.stringify(output));
        span.setStatus({ code: SpanStatusCode.OK });
        return output;
      } catch (err) {
        setSpanError(span, err);
        throw err;
      } finally {
        span.end();
        await forceFlush();
      }
    });
  };
};

type LlmCallConfig = {
  model: string;
  temperature: number;
  responseFormat: string;
  maxInputChars: number;
  messages: Array<{ role: string; content: string }>;
};

type LlmCallResult = {
  rawContent: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export const traceLlmCall = async <T extends LlmCallResult>(
  config: LlmCallConfig,
  fn: () => Promise<T>,
): Promise<T> => {
  if (!isTelemetryEnabled()) return fn();

  initTelemetry();
  const tracer = trace.getTracer(SERVICE_NAME);

  return tracer.startActiveSpan("chat.completions", async (span) => {
    span.setAttribute("overmind.span.type", "llm_call");
    span.setAttribute("gen_ai.request.model", config.model);
    span.setAttribute("gen_ai.request.temperature", config.temperature);
    span.setAttribute("gen_ai.request.response_format", config.responseFormat);
    span.setAttribute("gen_ai.request.max_input_chars", config.maxInputChars);
    span.setAttribute("gen_ai.input.messages", toGenAiMessages(config.messages));

    try {
      const result = await fn();

      span.setAttribute(
        "gen_ai.output.messages",
        JSON.stringify([
          {
            role: "assistant",
            parts: [{ type: "text", content: result.rawContent }],
          },
        ]),
      );

      if (result.usage?.prompt_tokens != null) {
        span.setAttribute("gen_ai.usage.input_tokens", result.usage.prompt_tokens);
      }
      if (result.usage?.completion_tokens != null) {
        span.setAttribute(
          "gen_ai.usage.output_tokens",
          result.usage.completion_tokens,
        );
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      setSpanError(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
};

export const shutdownTelemetry = async () => {
  if (provider) {
    await provider.shutdown();
    provider = null;
    initialized = false;
  }
};
