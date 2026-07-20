/**
 * Next.js instrumentation hook — initializes Overmind OTLP export once per
 * Node server process. Edge runtime is intentionally skipped.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initTelemetry } = await import("./lib/telemetry");
  initTelemetry();
}
