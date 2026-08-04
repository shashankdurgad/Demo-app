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

const count = Number(process.env.DEMO_EMAIL_COUNT || 250);
const { generateDemoEmails } = await import("../src/lib/generate-demo-emails.ts");
const { analyzeEmail } = await import("../src/lib/agent/triage.ts");
const { getLlmStatus } = await import("../src/lib/agent/llm.ts");

const emails = generateDemoEmails(count);
if (emails.length !== count) {
  console.error(
    `Hard failure: expected ${count} generated emails, found ${emails.length}`,
  );
  process.exit(1);
}

const status = getLlmStatus();
console.log(
  `Running ${emails.length} generated emails through analyzeEmail (${status.provider}/${status.model})…\n`,
);

const rows = [];
const started = Date.now();

for (let i = 0; i < emails.length; i += 1) {
  const email = emails[i];
  let record;
  try {
    record = await analyzeEmail(email, "demo");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Hard failure on ${email.id}: ${message}`);
    process.exit(1);
  }

  const row = {
    emailId: email.id,
    subject: email.subject,
    isInvoice: Boolean(record),
    confidence: record?.confidence ?? null,
    vendor: record?.vendor ?? null,
    amount: record?.amount?.raw ?? null,
    dueDate: record?.dueDate ?? null,
  };
  rows.push(row);

  const n = i + 1;
  if (n % 25 === 0 || n === emails.length) {
    const invoiceSoFar = rows.filter((r) => r.isInvoice).length;
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  [${n}/${emails.length}] invoices=${invoiceSoFar} elapsed=${elapsedSec}s last=${email.id} isInvoice=${row.isInvoice}`,
    );
  }
}

const invoiceRows = rows.filter((row) => row.isInvoice);
console.log("\nSummary");
console.log(`  Scanned: ${emails.length}`);
console.log(`  Classified as invoices: ${invoiceRows.length}`);
console.log(
  `  Rejected / non-invoices: ${emails.length - invoiceRows.length}`,
);
console.log(`  Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);

console.log("\nSample invoices (first 10):");
for (const row of invoiceRows.slice(0, 10)) {
  console.log(
    `  • ${row.vendor}: ${row.amount}, due ${row.dueDate} (confidence ${row.confidence})`,
  );
}

process.exit(0);
