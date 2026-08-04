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

const { EVAL_SCENARIOS_50 } = await import("../src/lib/eval-emails.ts");
const { analyzeEmail } = await import("../src/lib/agent/triage.ts");
const { getLlmStatus } = await import("../src/lib/agent/llm.ts");

if (EVAL_SCENARIOS_50.length !== 50) {
  console.error(
    `Hard failure: expected 50 eval scenarios, found ${EVAL_SCENARIOS_50.length}`,
  );
  process.exit(1);
}

const status = getLlmStatus();
console.log(
  `Running ${EVAL_SCENARIOS_50.length} eval scenarios through analyzeEmail (${status.provider}/${status.model})…\n`,
);

const results = [];
let triageCorrect = 0;

for (let i = 0; i < EVAL_SCENARIOS_50.length; i += 1) {
  const scenario = EVAL_SCENARIOS_50[i];
  const { email, expected } = scenario;

  let record;
  try {
    record = await analyzeEmail(email, "demo");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Hard failure on ${email.id}: ${message}`);
    process.exit(1);
  }

  const predictedIsInvoice = Boolean(record);
  const triageOk = predictedIsInvoice === expected.isInvoice;
  if (triageOk) triageCorrect += 1;

  const row = {
    id: email.id,
    subject: email.subject,
    notes: expected.notes,
    expectedIsInvoice: expected.isInvoice,
    predictedIsInvoice,
    triageOk,
    expectedAmount: expected.amount ?? null,
    predictedAmount: record?.amount?.value ?? null,
    expectedDue: expected.dueDate ?? null,
    predictedDue: record?.dueDate ?? null,
    confidence: record?.confidence ?? null,
    vendor: record?.vendor ?? null,
  };
  results.push(row);

  const mark = triageOk ? "OK" : "MISS";
  console.log(
    `[${String(i + 1).padStart(2, "0")}/50] ${mark} ${email.id} expected=${expected.isInvoice} got=${predictedIsInvoice} — ${expected.notes}`,
  );
}

const misses = results.filter((r) => !r.triageOk);
console.log("\nEval summary");
console.log(`  Scenarios: ${results.length}`);
console.log(
  `  Triage accuracy (isInvoice): ${triageCorrect}/${results.length} (${((100 * triageCorrect) / results.length).toFixed(1)}%)`,
);
console.log(`  Misses: ${misses.length}`);

if (misses.length) {
  console.log("\nMissed triage cases:");
  for (const m of misses) {
    console.log(
      `  • ${m.id}: expected isInvoice=${m.expectedIsInvoice}, got ${m.predictedIsInvoice} — ${m.notes}`,
    );
  }
}

process.exit(0);
