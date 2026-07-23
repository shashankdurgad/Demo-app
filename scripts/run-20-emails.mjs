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

const { DEMO_EMAILS } = await import("../src/lib/demo-emails.ts");
const { analyzeEmail } = await import("../src/lib/agent/triage.ts");
const { getLlmStatus } = await import("../src/lib/agent/llm.ts");
const {
  forceFlushTraces,
  initTelemetry,
  isNestEntryPointsEnabled,
  isTelemetryEnabled,
  withBatchSpan,
} = await import("../src/lib/telemetry.ts");

initTelemetry();

if (DEMO_EMAILS.length !== 20) {
  console.error(
    `Hard failure: expected exactly 20 demo emails, found ${DEMO_EMAILS.length}`,
  );
  process.exit(1);
}

const status = getLlmStatus();
const nest = isNestEntryPointsEnabled();
console.log(
  `Running ${DEMO_EMAILS.length} emails through analyzeEmail (${status.provider}/${status.model})…`,
);
if (!isTelemetryEnabled()) {
  console.log(
    "Overmind telemetry: OFF (set OVERMIND_API_KEY to export traces)\n",
  );
} else if (nest) {
  console.log(
    `Overmind: NESTED mode — one batch root + ${DEMO_EMAILS.length} analyzeEmail entry_points`,
  );
  console.log(
    "(requires OVERMIND_NEST_ENTRY_POINTS=1 and OVERMIND_API_KEY)\n",
  );
} else {
  console.log(
    "Overmind telemetry: ON (one entry_point + llm_call trace per email)",
  );
  console.log(
    "(set OVERMIND_NEST_ENTRY_POINTS=1 for one batch root + N entry_points)\n",
  );
}

const rows = [];

const runLoop = async () => {
  for (const email of DEMO_EMAILS) {
    let record;
    try {
      record = await analyzeEmail(email, "demo");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Hard failure on ${email.id}: ${message}`);
      await forceFlushTraces();
      process.exit(1);
    }

    const row = {
      emailId: email.id,
      subject: email.subject,
      isInvoice: Boolean(record),
      harnessOutput: record,
    };
    rows.push(row);
    console.log(JSON.stringify(row, null, 2));
    console.log("---");
  }
  return rows;
};

// Batch parent is the sole structural root when nest flag is on; no-op otherwise.
await withBatchSpan(
  "batchScan",
  { source: "demo", emailCount: DEMO_EMAILS.length },
  runLoop,
);

const invoiceRows = rows.filter((row) => row.isInvoice);
console.log("\nSummary");
console.log(`  Scanned: ${DEMO_EMAILS.length}`);
console.log(`  Classified as invoices: ${invoiceRows.length}`);
console.log(
  `  Rejected / non-invoices: ${DEMO_EMAILS.length - invoiceRows.length}`,
);

await forceFlushTraces();
process.exit(0);
