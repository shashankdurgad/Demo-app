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

// Prefer local Ollama when configured (cost). OpenAI remains default otherwise.
if (process.env.OLLAMA_BASE_URL) {
  delete process.env.OPENAI_API_KEY;
}

const count = Number(process.env.THEMES_EMAIL_COUNT || 1200);
const concurrency = Math.max(1, Number(process.env.THEMES_CONCURRENCY || 8));

const { getLlmStatus } = await import("../src/lib/agent/llm.ts");
const {
  analyzeThemesEmail,
  generateThemesCorpus,
  tallyModes,
} = await import("../src/lib/themes-corpus.ts");

const { items, modeByEmailId } = generateThemesCorpus(count);
if (items.length !== count) {
  console.error(
    `Hard failure: expected ${count} themes emails, found ${items.length}`,
  );
  process.exit(1);
}

const planned = tallyModes(items);
const status = getLlmStatus();
console.log(
  `Themes corpus: ${items.length} emails, concurrency=${concurrency} (${status.provider}/${status.model})\n`,
);
console.log("Planned mode mix:");
for (const [mode, n] of [...planned.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  console.log(`  ${mode}: ${n}`);
}
console.log("");

const started = Date.now();
const results = new Array(items.length);
let completed = 0;
let nextIndex = 0;

const worker = async () => {
  while (true) {
    const i = nextIndex;
    nextIndex += 1;
    if (i >= items.length) return;

    const item = items[i];
    // Never abort the batch — failures are part of the corpus.
    const outcome = await analyzeThemesEmail(item);
    results[i] = outcome;

    completed += 1;
    if (completed % 25 === 0 || completed === items.length) {
      const failed = results
        .slice(0, completed)
        .filter((r) => r && !r.ok).length;
      const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `  [${completed}/${items.length}] failed=${failed} elapsed=${elapsedSec}s last=${item.email.id} mode=${item.mode} ok=${outcome.ok}`,
      );
    }
  }
};

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
const byMode = new Map();

for (const row of results) {
  if (!row) continue;
  const mode = modeByEmailId.get(row.emailId) || row.mode;
  byMode.set(mode, (byMode.get(mode) || 0) + 1);
}

const okCount = results.filter((r) => r?.ok).length;
const failCount = results.filter((r) => r && !r.ok).length;

console.log("\nThemes corpus summary");
console.log(`  Provider/model: ${status.provider}/${status.model}`);
console.log(`  Total attempted: ${results.length}`);
console.log(`  Completed ok (no throw): ${okCount}`);
console.log(`  Completed with error status: ${failCount}`);
console.log(`  Elapsed: ${elapsedSec}s`);
console.log("\nPer-mode tally (intended tags):");
for (const mode of [...byMode.keys()].sort()) {
  const n = byMode.get(mode);
  console.log(`  ${mode}: ${n}`);
}

process.exit(0);
