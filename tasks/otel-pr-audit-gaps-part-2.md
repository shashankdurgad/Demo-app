# Automated OTEL PR — Audit Gaps (Part 2)

Follow-on gaps found after Part 1 guardrails landed: export worked, harness I/O + parts-based messages were present, and live scorers could pass — but span typing / two-layer trajectory were still wrong.

**Part 1:** [`otel-pr-audit-gaps.md`](./otel-pr-audit-gaps.md)

## Context (this round)

- Branch / PR under review: `overmind/add-otel-82d07a2e`
- Instrumentation lives in `src/lib/tracing.ts` + `src/lib/agent/llm.ts` (direct OTLP + `X-Api-Key`)
- Verified traces: `c7709451…`, `e847be12…`
- Symptom: scorers OK (`final_output` non-empty, Live Task Success = 1.0 on `e847be12…`), but Overmind still treats the tree as non-two-layer

---

## Gap 13 — Missing `overmind.span.type` (root not marked `entry_point`)

**Status:** Open

**What happened:** Parent/child spans were created and exported, but neither span set `overmind.span.type`. Overmind stored **both** as `span_type=llm_call`. The root operation was named `"Ledgerline Invoice Triage Agent"` but was not classified as `entry_point`.

**Why it matters:**
- Part 1 Gap 5’s “one entry_point + llm_call child” only becomes real in Overmind when the attr is stamped.
- Without it, UI/type filters and two-layer normalization (Gap 14) do not treat the root as an agent harness.

**Expected:**
- Root / agent harness: `overmind.span.type = "entry_point"`
- Model HTTP call child: `overmind.span.type = "llm_call"`

**Related:** Part 1 Gap 5 mentioned hierarchy in prose but did **not** previously name this attribute — that omission let later auto-PRs miss it while still looking “hierarchical” in the raw OTel tree.

---

## Gap 14 — No two-layer trajectory (`two_layer=None`, `root_io` only)

**Status:** Open — consequence of Gap 13 (and/or missing entry-point semantics)

**What happened:** On `e847be12…`, after live scoring:

- `normalize_spans` → `extraction.path = root_io`, `two_layer = None`
- `messages` = synthetic `user` / `assistant` built from harness `overmind.input.data` / `overmind.output.data`
- `model_output` / `agent_output` empty
- Child `llm_call` **does** have parseable parts-based `gen_ai.*.messages` (`system` / `user` / `assistant`), but they are not lifted into the two-layer trajectory

**Why it matters:**
- Live scorers can still pass using harness JSON (as on `e847be12…`: Live Task Success / Confidence / etc. = 1.0).
- Evidence is weaker / less faithful: scorers do not see the real prompt (system instructions + full user prompt) via the two-layer path.
- DoD should require `two_layer=true` with non-empty `model_output` / `agent_output` when an LLM child exists — not only non-empty `final_output`.

**Fix direction:**
- Stamp Gap 13 types so Overmind recognizes `entry_point` wrapping `llm_call`.
- Keep harness I/O on the entry span and parts-based gen_ai messages on the LLM child.

---

## Gap 15 — Minor polish gaps on newer auto-PR

**Status:** Open (non-blocking for basic scoring; still worth fixing)

Observed on `e847be12…` / `c7709451…`:

1. **Success status left `UNSET` (0)** — spans end without `SpanStatusCode.OK` on the happy path (errors do set `ERROR`).
2. **Full email body in root harness I/O** — `overmind.input.data` includes the full `text` field (PII / retention). Prefer metadata on entry + prompt on the LLM child (Part 1 Gap 5 intent).
3. **`gen_ai.request.max_input_chars` not stamped** — temperature / response_format are present; the 10k truncate limit is not (see also Part 1 Gaps 8 / 12).

---

## Checklist additions (Part 2)

Add these on top of the Part 1 checklist:

1. [ ] **Stamp `overmind.span.type`** explicitly: root = `entry_point`, model call = `llm_call` (parent/child alone is not enough).
2. [ ] When an LLM child exists, prove `two_layer=true` and non-empty `model_output` / `agent_output` (not only `root_io` / non-empty `final_output`).
3. [ ] Set span status `OK` on success; `ERROR` + `recordException` on failure.
4. [ ] Prefer metadata-only harness input on the entry span; keep full prompt/body on the LLM child.
5. [ ] Stamp `gen_ai.request.max_input_chars` (or equivalent truncate limit) alongside temperature / response_format.

---

## Repro notes (Part 2)

- Trace `e847be12…`: export + live scores 1.0, but Gaps **13–15** open (`span_type` both `llm_call`, `two_layer=None`, `root_io` only).
- Trace `c7709451…`: same shape; correctness may land before `trace_scoring` — wait for scoring before judging.
- Contrast: Part 1 trace `1daceb18…` had `entry_point` + `llm_call` and `two_layer=true`.
