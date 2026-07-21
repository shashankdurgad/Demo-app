import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadEnvLocal = () => {
  const envPath = resolve(process.cwd(), ".env.local");
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    throw new Error("Missing .env.local — add OPENAI_API_KEY before running.");
  }

  for (const line of raw.split("\n")) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadEnvLocal();

if (!process.env.OPENAI_API_KEY && !process.env.OLLAMA_BASE_URL) {
  console.error(
    "Hard failure: set OPENAI_API_KEY or OLLAMA_BASE_URL in .env.local",
  );
  process.exit(1);
}

const { EVAL_SCENARIOS_B_50 } = await import("../src/lib/eval-emails-b.ts");
const { analyzeEmail } = await import("../src/lib/agent/triage.ts");
const { getLlmStatus } = await import("../src/lib/agent/llm.ts");
const { flushTraces, forceFlushTraces, initTelemetry, isTelemetryEnabled } =
  await import("../src/lib/telemetry.ts");

initTelemetry();

if (EVAL_SCENARIOS_B_50.length !== 50) {
  console.error(
    `Hard failure: expected 50 eval-B scenarios, found ${EVAL_SCENARIOS_B_50.length}`,
  );
  process.exit(1);
}

const status = getLlmStatus();
console.log(
  `Running ${EVAL_SCENARIOS_B_50.length} eval-B scenarios (${status.provider}/${status.model})…`,
);
console.log(
  isTelemetryEnabled()
    ? "Overmind telemetry: ON\n"
    : "Overmind telemetry: OFF\n",
);

const results = [];
let triageCorrect = 0;
const started = Date.now();

for (let i = 0; i < EVAL_SCENARIOS_B_50.length; i += 1) {
  const { email, expected } = EVAL_SCENARIOS_B_50[i];

  let record;
  try {
    record = await analyzeEmail(email, "demo");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Hard failure on ${email.id}: ${message}`);
    await forceFlushTraces();
    process.exit(1);
  }

  const predictedIsInvoice = Boolean(record);
  const triageOk = predictedIsInvoice === expected.isInvoice;
  if (triageOk) triageCorrect += 1;

  results.push({
    id: email.id,
    notes: expected.notes,
    expectedIsInvoice: expected.isInvoice,
    predictedIsInvoice,
    triageOk,
    confidence: record?.confidence ?? null,
    vendor: record?.vendor ?? null,
    amount: record?.amount?.raw ?? null,
  });

  const mark = triageOk ? "OK" : "MISS";
  console.log(
    `[${String(i + 1).padStart(2, "0")}/50] ${mark} ${email.id} expected=${expected.isInvoice} got=${predictedIsInvoice} — ${expected.notes}`,
  );

  if ((i + 1) % 10 === 0) await flushTraces();
}

const misses = results.filter((r) => !r.triageOk);
console.log("\nEval-B summary");
console.log(`  Scenarios: ${results.length}`);
console.log(
  `  Triage accuracy (isInvoice): ${triageCorrect}/${results.length} (${((100 * triageCorrect) / results.length).toFixed(1)}%)`,
);
console.log(`  Misses: ${misses.length}`);
console.log(`  Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);

if (misses.length) {
  console.log("\nMissed triage cases:");
  for (const m of misses) {
    console.log(
      `  • ${m.id}: expected isInvoice=${m.expectedIsInvoice}, got ${m.predictedIsInvoice} — ${m.notes}`,
    );
  }
}

await forceFlushTraces();
process.exit(0);
