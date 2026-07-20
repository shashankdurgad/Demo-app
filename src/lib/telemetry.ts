import { context, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Span, Tracer } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const TRACER_NAME = "invoice-agent";
const SDK_NAME = "overmind-otel-js";
const SDK_VERSION = "0.1.0";

/** Known OpenAI list prices (USD per 1M tokens). Omit unknown models. */
const MODEL_PRICING_PER_M: Record<string, { prompt: number; completion: number }> =
  {
    "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
    "gpt-4o": { prompt: 2.5, completion: 10 },
    "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
    "gpt-4.1": { prompt: 2, completion: 8 },
  };

let provider: BasicTracerProvider | null = null;
let initialized = false;

export const isTelemetryEnabled = () => Boolean(process.env.OVERMIND_API_KEY);

const jsonStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  } catch {
    return JSON.stringify(String(value));
  }
};

const toOtelMessages = (
  messages: Array<{ role: string; content: string }>,
) =>
  messages.map((message) => ({
    role: message.role,
    parts: [{ type: "text", content: message.content }],
  }));

const estimateCostUsd = (
  model: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): number | undefined => {
  const pricing = MODEL_PRICING_PER_M[model];
  if (!pricing) return undefined;
  if (promptTokens == null && completionTokens == null) return undefined;
  const cost =
    ((promptTokens ?? 0) / 1_000_000) * pricing.prompt +
    ((completionTokens ?? 0) / 1_000_000) * pricing.completion;
  return cost > 0 ? Number(cost.toFixed(8)) : undefined;
};

const stampIdentity = (span: Span) => {
  const agentId = process.env.OVERMIND_AGENT_ID;
  const agentName = process.env.OVERMIND_AGENT_NAME;
  const projectId = process.env.OVERMIND_PROJECT_ID;
  if (agentId) span.setAttribute("overmind.agent.id", agentId);
  if (agentName) span.setAttribute("overmind.agent.name", agentName);
  if (projectId) span.setAttribute("overmind.project.id", projectId);
};

const finalizeSpan = (
  span: Span,
  startMs: number,
  error: unknown | null,
) => {
  const durationSeconds = Math.max(0, (Date.now() - startMs) / 1000);
  span.setAttribute("overmind.duration.seconds", durationSeconds);

  if (error == null) {
    span.setAttribute("overmind.status", "success");
    span.setStatus({ code: SpanStatusCode.OK });
    return;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  span.setAttribute("overmind.status", "failed");
  span.setAttribute("overmind.error.type", err.name || "Error");
  span.setAttribute("overmind.error.message", err.message.slice(0, 1024));
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
};

const hasRealTracerProvider = () => {
  const current = trace.getTracerProvider() as {
    getDelegate?: () => { constructor?: { name?: string } };
  };
  const delegateName = current.getDelegate?.()?.constructor?.name;
  return Boolean(
    delegateName &&
      delegateName !== "ProxyTracerProvider" &&
      delegateName !== "NoopTracerProvider",
  );
};

const ensureContextManager = () => {
  try {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
  } catch {
    // Already registered — OpenTelemetry only allows one global manager.
  }
};

export const initTelemetry = () => {
  if (initialized) return;
  initialized = true;

  if (!isTelemetryEnabled()) return;

  // Respect an already-registered provider (tests / fan-out).
  if (hasRealTracerProvider()) {
    ensureContextManager();
    return;
  }

  ensureContextManager();

  const apiKey = process.env.OVERMIND_API_KEY!;
  const baseUrl = (
    process.env.OVERMIND_API_URL || "https://api.overmindlab.ai"
  ).replace(/\/$/, "");
  const environment =
    process.env.OVERMIND_ENVIRONMENT ||
    process.env.DEPLOYMENT_ENVIRONMENT ||
    "development";

  const attributes: Record<string, string> = {
    [ATTR_SERVICE_NAME]:
      process.env.OVERMIND_SERVICE_NAME || "invoice-agent",
    [ATTR_SERVICE_VERSION]:
      process.env.SERVICE_VERSION || SDK_VERSION,
    "deployment.environment": environment,
    "overmind.sdk.name": SDK_NAME,
    "overmind.sdk.version": SDK_VERSION,
  };

  if (process.env.OVERMIND_AGENT_ID) {
    attributes["overmind.agent.id"] = process.env.OVERMIND_AGENT_ID;
  }
  if (process.env.OVERMIND_AGENT_NAME) {
    attributes["overmind.agent.name"] = process.env.OVERMIND_AGENT_NAME;
  }
  if (process.env.OVERMIND_PROJECT_ID) {
    attributes["overmind.project.id"] = process.env.OVERMIND_PROJECT_ID;
  }

  const exporter = new OTLPTraceExporter({
    url: `${baseUrl}/api/v1/traces`,
    headers: { "X-Api-Key": apiKey },
  });

  // Register via the same @opentelemetry/api instance our helpers use
  // (NodeSDK under tsx/ESM can bind a different API copy → silent no-op).
  provider = new BasicTracerProvider({
    resource: resourceFromAttributes(attributes),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
};

/** Flush without tearing down the provider (Next.js request end). */
export const flushTraces = async () => {
  if (!isTelemetryEnabled()) return;

  if (provider) {
    try {
      await provider.forceFlush();
    } catch {
      // Best-effort — SimpleSpanProcessor already exports on span end.
    }
    return;
  }

  const current = trace.getTracerProvider() as {
    forceFlush?: () => Promise<void>;
    getDelegate?: () => { forceFlush?: () => Promise<void> };
  };
  const target = current.getDelegate?.() ?? current;
  if (typeof target.forceFlush === "function") {
    try {
      await target.forceFlush();
    } catch {
      // ignore
    }
  }
};

/** Flush + shut down (scripts / process exit). */
export const forceFlushTraces = async () => {
  if (!isTelemetryEnabled()) return;

  if (provider) {
    try {
      await provider.shutdown();
    } catch {
      // Best-effort flush for short-lived scripts.
    } finally {
      provider = null;
      initialized = false;
    }
    return;
  }

  await flushTraces();
};

const getTracer = (): Tracer | null => {
  if (!isTelemetryEnabled()) return null;
  if (!initialized) initTelemetry();
  if (!isTelemetryEnabled()) return null;
  return trace.getTracer(TRACER_NAME);
};

export type ChatMessage = { role: string; content: string };

export type LlmCallResult<T> = {
  result: T;
  /** True raw assistant message content, before Zod / normalization. */
  rawContent: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  responseModel?: string;
  finishReason?: string;
};

/**
 * Root entry_point span for one email (one email → one trace → one datapoint).
 * Starts under ROOT_CONTEXT so a scan loop never nests emails into one trace.
 */
export const withEntryPointSpan = async <T>(
  name: string,
  inputs: unknown,
  fn: () => Promise<T>,
): Promise<T> => {
  const tracer = getTracer();
  if (!tracer) return fn();

  const span = tracer.startSpan(name, undefined, ROOT_CONTEXT);
  const startMs = Date.now();
  span.setAttribute("overmind.span.type", "entry_point");
  stampIdentity(span);
  span.setAttribute("inputs", jsonStringify(inputs));

  return context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
    try {
      const result = await fn();
      span.setAttribute("outputs", jsonStringify(result));
      finalizeSpan(span, startMs, null);
      return result;
    } catch (error) {
      finalizeSpan(span, startMs, error);
      throw error;
    } finally {
      span.end();
    }
  });
};

/**
 * Child llm_call span. Captures BOTH Overmind surfaces for the model call:
 * gen_ai.*.messages (OTel semconv) and overmind.*.data, plus genai.* usage.
 */
export const withLlmCallSpan = async <T>(
  meta: {
    name?: string;
    model: string;
    provider: string;
    messages: ChatMessage[];
    temperature?: number;
  },
  fn: () => Promise<LlmCallResult<T>>,
): Promise<T> => {
  const tracer = getTracer();
  if (!tracer) {
    const { result } = await fn();
    return result;
  }

  const spanName = meta.name || "analyzeEmailWithLlm";
  const parentContext = context.active();
  return tracer.startActiveSpan(spanName, {}, parentContext, async (span) => {
    const startMs = Date.now();
    span.setAttribute("overmind.span.type", "llm_call");
    stampIdentity(span);

    const otelInputMessages = toOtelMessages(meta.messages);
    span.setAttribute(
      "gen_ai.input.messages",
      jsonStringify(otelInputMessages),
    );
    span.setAttribute("overmind.input.data", jsonStringify(meta.messages));

    span.setAttribute("genai.model", meta.model);
    span.setAttribute("genai.provider", meta.provider);
    span.setAttribute("gen_ai.request.model", meta.model);
    span.setAttribute("gen_ai.system", meta.provider);

    span.setAttribute("genai.request.message_count", meta.messages.length);
    span.setAttribute(
      "genai.request.message_chars",
      meta.messages.reduce((sum, m) => sum + m.content.length, 0),
    );
    span.setAttribute("genai.request.tool_count", 0);

    if (meta.temperature != null) {
      span.setAttribute("genai.request.temperature", meta.temperature);
    }

    try {
      const outcome = await fn();
      const elapsedSeconds = Math.max(0, (Date.now() - startMs) / 1000);
      span.setAttribute("genai.elapsed_seconds", elapsedSeconds);

      const otelOutputMessages = toOtelMessages([
        { role: "assistant", content: outcome.rawContent },
      ]);
      span.setAttribute(
        "gen_ai.output.messages",
        jsonStringify(otelOutputMessages),
      );
      span.setAttribute("overmind.output.data", outcome.rawContent);
      span.setAttribute(
        "genai.response.message_chars",
        outcome.rawContent.length,
      );

      if (outcome.responseModel) {
        span.setAttribute("genai.response.model", outcome.responseModel);
        span.setAttribute("gen_ai.response.model", outcome.responseModel);
      }
      if (outcome.finishReason) {
        span.setAttribute(
          "genai.response.finish_reason",
          outcome.finishReason,
        );
      }

      const promptTokens = outcome.usage?.prompt_tokens;
      const completionTokens = outcome.usage?.completion_tokens;
      let totalTokens = outcome.usage?.total_tokens;
      if (
        totalTokens == null &&
        (promptTokens != null || completionTokens != null)
      ) {
        totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0);
      }

      // Never zero-fill — only set attributes we actually have.
      if (promptTokens != null) {
        span.setAttribute("genai.prompt_tokens", promptTokens);
        span.setAttribute("genai.usage.prompt_tokens", promptTokens);
        span.setAttribute("gen_ai.usage.prompt_tokens", promptTokens);
      }
      if (completionTokens != null) {
        span.setAttribute("genai.completion_tokens", completionTokens);
        span.setAttribute("genai.usage.completion_tokens", completionTokens);
        span.setAttribute("gen_ai.usage.completion_tokens", completionTokens);
      }
      if (totalTokens != null) {
        span.setAttribute("genai.total_tokens", totalTokens);
        span.setAttribute("genai.usage.total_tokens", totalTokens);
        span.setAttribute("gen_ai.usage.total_tokens", totalTokens);
      }

      const cost = estimateCostUsd(
        meta.model,
        promptTokens,
        completionTokens,
      );
      if (cost != null) {
        span.setAttribute("genai.cost", cost);
      }

      finalizeSpan(span, startMs, null);
      return outcome.result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      span.setAttribute("genai.error", err.name || "Error");
      span.setAttribute(
        "genai.elapsed_seconds",
        Math.max(0, (Date.now() - startMs) / 1000),
      );
      finalizeSpan(span, startMs, error);
      throw error;
    } finally {
      span.end();
    }
  });
};
