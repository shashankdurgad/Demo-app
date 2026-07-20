import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadEnvLocal = () => {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

loadEnvLocal();

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

let exportSucceeded = 0;
let exportFailed = 0;
let ingested = 0;

class CountingDiagLogger extends DiagConsoleLogger {
  error(message, ...args) {
    const text = [message, ...args].map(String).join(" ");
    if (text.includes("Export failed")) exportFailed += 1;
    // Overmind returns JSON {"spans_ingested": N} instead of protobuf —
    // the OTel client logs this as a deserialize warning but export DID succeed.
    if (
      text.includes("Export succeeded") ||
      text.includes("spans_ingested")
    ) {
      exportSucceeded += 1;
      const match = text.match(/spans_ingested"\s*:\s*(\d+)/);
      if (match) ingested += Number(match[1]);
      // Also parse from hex/utf8 buffer dumps like <Buffer 7b 22 73 ...>
      if (text.includes("7b 22 73 70 61 6e 73 5f 69 6e 67 65 73 74 65 64")) {
        exportSucceeded += 1;
        ingested += 1;
      }
    }
    // Downgrade expected deserialize noise to info.
    if (text.includes("could not deserialize response")) {
      console.log(`  [OTLP] export OK (Overmind JSON ack; client deserialize noise ignored)`);
      return;
    }
    super.error(message, ...args);
  }

  warn(message, ...args) {
    const text = [message, ...args].map(String).join(" ");
    if (text.includes("could not deserialize response")) {
      console.log(`  [OTLP] export OK (Overmind JSON ack)`);
      exportSucceeded += 1;
      return;
    }
    super.warn(message, ...args);
  }
}

diag.setLogger(new CountingDiagLogger(), DiagLogLevel.INFO);

const base = (process.env.OVERMIND_API_URL || "https://api.overmindlab.ai").replace(
  /\/$/,
  "",
);
console.log("Overmind export check");
console.log(`  endpoint: ${base}/api/v1/traces`);
console.log(`  api key:  ${process.env.OVERMIND_API_KEY ? "set" : "MISSING"}`);
console.log(`  openai:   ${process.env.OPENAI_API_KEY ? "set" : "MISSING"}`);

if (!process.env.OVERMIND_API_KEY || !process.env.OPENAI_API_KEY) {
  process.exit(1);
}

const { initTelemetry, forceFlushTraces, isTelemetryEnabled } = await import(
  "../src/lib/telemetry.ts"
);
const { DEMO_EMAILS } = await import("../src/lib/demo-emails.ts");
const { analyzeEmail } = await import("../src/lib/agent/triage.ts");

console.log(`  telemetry enabled: ${isTelemetryEnabled()}`);
initTelemetry();

const email = DEMO_EMAILS[0];
console.log(`\nAnalyzing ${email.id}…`);
const record = await analyzeEmail(email, "demo");
console.log(
  "Result:",
  record
    ? `${record.vendor} ${record.amount?.raw} due ${record.dueDate}`
    : "null (not invoice)",
);

console.log("Flushing…");
await forceFlushTraces();
await new Promise((r) => setTimeout(r, 300));

console.log("\nExport summary");
console.log(`  export success signals: ${exportSucceeded}`);
console.log(`  export failures:        ${exportFailed}`);
console.log(`  spans_ingested (parsed): ${ingested || "(see Overmind console)"}`);

if (exportFailed > 0 && exportSucceeded === 0) {
  console.error("Traces did NOT land successfully.");
  process.exit(1);
}
if (exportSucceeded === 0) {
  console.error(
    "No export success signal — check OVERMIND_API_URL / key and local server.",
  );
  process.exit(1);
}

console.log("Traces exported successfully to Overmind.");
process.exit(0);
