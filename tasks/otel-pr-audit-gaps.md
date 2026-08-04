# Automated OTEL PR — Audit Gaps

Gaps found while auditing the automated OpenTelemetry / Overmind instrumentation PR against this repo (`invoice-agent` / Ledgerline). Use these as checklist items when reviewing future auto-instrumentation PRs and when updating Cursor agent prompts that generate them.

## Context

- App calls the LLM via **raw `fetch`** to the OpenAI-compatible chat completions HTTP API (not the `openai` npm client).
- Overmind was initially wired via `@overmind-lab/trace-sdk` (`OvermindClient` + `initTracing` with `enabledProviders: { openai: OpenAI }`).
- Manual spans were added with `@opentelemetry/api` `trace.getTracer(...).startActiveSpan(...)`.
- Symptom progression: agent runs succeeded, but (1) no traces exported, then (2) export 404/auth failures from the JS SDK, then (3) traces visible but live scorers saw empty `output`.

Note: defaulting ingest to production (`api.overmindlab.ai`) is correct for real users. Local-dev base URL overrides are an environment concern, not a product PR gap.

---

## Gap 1 — Spans never ended (export blocker)

**Status:** Fixed

**What happened:** Wrappers used `tracer.startActiveSpan(name, async (span) => { ... })` but never called `span.end()`.

**Why it matters:** In the installed OTel SDK, `startActiveSpan` does **not** auto-end the span. `SimpleSpanProcessor` only exports on span end.

**Fix applied:**
- Added `withSpan()` in `src/lib/overmind.ts` that always `span.end()`s in `finally`.
- All traced call sites (`analyzeEmail`, `analyzeEmailWithLlm`, themes harness) go through `withSpan()`.

---

## Gap 2 — SDK provider patching does not match how the app calls the LLM

**Status:** Fixed

**What happened:** Overmind init patched the OpenAI SDK class, but the app uses raw `fetch` to chat completions.

**Fix applied:**
- Emit an explicit `llm_call` span around the `fetch` in `src/lib/agent/llm.ts`.
- Stamp `gen_ai.*` request/response/usage attributes on that span.
- Do not rely on `enabledProviders: { openai: OpenAI }` for this app’s LLM path.

---

## Gap 3 — Process exit without flush / shutdown

**Status:** Fixed

**What happened:** CLI scripts called `process.exit(0)` with no SDK shutdown.

**Fix applied:**
- Added `shutdownOvermindTracing()` in `src/lib/overmind.ts`.
- All run scripts (`run-20-emails`, `run-100/250`, eval-50/50b, themes) await shutdown before `process.exit` (including hard-failure paths after work started).

---

## Gap 4 — “API key is enough” vs incomplete wiring

**Status:** Process gap (checklist) — partially addressed in code by making export actually work

**What happened:** Key present ≠ traces visible.

**Fix / guidance applied:**
- Export path/header corrected (Gap 6) and spans ended (Gap 1) so a real run can succeed.
- Prompt checklist still requires a verified export / UI confirmation as DoD.

---

## Gap 5 — Manual span quality / Overmind semantics

**Status:** Fixed (hierarchy); extended by Gaps 7–9 for scoring attrs

**What happened:** Over-wrapped nested `entry_point`s; heavy PII `inputs`/`outputs`.

**Fix applied:**
- One `entry_point` per email (`analyzeEmail` / themes harness).
- One `llm_call` child for the model HTTP call.
- Removed extra wrappers on scan route / batch orchestrator / internal LLM helpers.
- Entry span avoids full email body; LLM child carries the prompt.

---

## Gap 6 — Broken ingest URL / auth header in `@overmind-lab/trace-sdk@0.0.6`

**Status:** Fixed (workaround)

**What happened:** SDK posts to `{base}/api/v1/traces/create` with `X-API-TOKEN` → 404 / not authenticated.

Official ingest:

- `POST {base}/api/v1/traces`
- Header: `X-Api-Key: ovr_...`

**Fix applied:**
- Bypass broken SDK exporter in `src/lib/overmind.ts`.
- Wire `OTLPTraceExporter` directly to `{OVERMIND_TRACES_URL || https://api.overmindlab.ai}/api/v1/traces` with `X-Api-Key`.

---

## Gap 7 — Final output attrs not Overmind-scorer compatible

**Status:** Fixed (superseded by Gap 10 for the correct attribute keys)

**What happened:** Trace `b3edf721…` exported successfully, but live scorers reported empty `output`. Early fix stamped plain `input` / `output` JSON.

**Partial fix applied:** structured extraction fields on entry/LLM spans.

---

## Gap 8 — Missing mechanically checkable LLM request params

**Status:** Partially fixed (attrs stamped; see Gap 12)

**What happened:** Card-constraints abstained for temperature / json_object / 10k truncate rules.

**Fix applied:**
- On `llm_call`: `gen_ai.request.temperature`, `gen_ai.request.response_format`, `gen_ai.request.max_input_chars`.

---

## Gap 9 — `gen_ai.*.messages` shape

**Status:** Fixed (superseded by Gap 11 for parts-based schema)

**What happened:** Initially a bare string; then `{role, content}` lists — still not what Overmind’s semconv parser accepts.

---

## Gap 10 — Wrong I/O attribute keys for Overmind normalizer

**Status:** Fixed

**What happened:** Trace `70c39d8b…` had `input` / `output` / `output.isInvoice` present in the DB, but `normalize_spans` still produced **empty `final_output`**.

Overmind only treats these as harness I/O (priority order):

- input: `overmind.input.data` | `overmind.input_data` | `traceloop.entity.input` | `inputs`
- output: `overmind.output.data` | `overmind.output_data` | `traceloop.entity.output` | `outputs`

Plain `input` / `output` are ignored → `_has_io_attrs(entry_point) == false` → scorers see empty evidence.

**Fix applied:**
- `stampSpanInput` / `stampSpanOutput` now write `overmind.input.data` / `overmind.output.data` (plus `inputs` / `outputs` aliases).

---

## Gap 11 — `gen_ai.*.messages` must be parts-based semconv

**Status:** Fixed

**What happened:** On `70c39d8b…`, `gen_ai.input.messages` / `gen_ai.output.messages` existed as ChatML `{role, content}` lists, but `parse_genai_semconv_messages` returned `(None, None)`.

Overmind expects the newer parts schema:

```json
[{"role":"user","parts":[{"type":"text","content":"..."}]}]
```

not:

```json
[{"role":"user","content":"..."}]
```

Without that, trajectory extraction falls through to empty `root_io`.

**Fix applied:**
- `toGenAiPartsMessages()` in `src/lib/overmind.ts`.
- LLM span stamps parts-based `gen_ai.input.messages` / `gen_ai.output.messages`.

---

## Gap 12 — Card-constraint abstains are often card-params, not missing span attrs

**Status:** Documented (mostly not an app instrumentation bug)

**What happened:** Even after stamping temperature / response_format / max_input_chars, card-constraints on `70c39d8b…` still abstained with:

- `output_format` → “no mechanically checkable format param”
- `budget` → “no numeric max_calls budget param”

Overmind’s mechanical checker only understands compiled **typed params** on the card:

- `output_format`: `params.format == "json"` or `params.fence_output == false`
- `budget`: `params.max_calls` / `max_tool_calls` (tool-call count — **not** input char limits)

Prose rules about temperature=0 or 10k char truncation currently compile to types that don’t read `gen_ai.request.*` attrs. Fixing those requires card/compiler changes (or richer typed params), not more span fields alone.

**App-side note:** keep stamping `gen_ai.request.*` for UI/debug; don’t treat constraint abstains on those rules as proof the exporter is broken.

---

## Suggested agent-prompt checklist (copy into Cursor prompts)

When generating or reviewing an automated OTEL / Overmind instrumentation PR:

1. [ ] Identify the real LLM transport (`openai` SDK vs `fetch` vs other) and instrument **that** path.
2. [ ] If using `startActiveSpan`, always `span.end()` in `finally` (or use a helper that guarantees it).
3. [ ] Register / init the exporter **before** traced work; no-op cleanly when the API key is unset.
4. [ ] Use documented ingest URL + auth header (`/api/v1/traces` + `X-Api-Key`); do not assume SDK defaults are correct.
5. [ ] Flush or `shutdown()` before CLI `process.exit`.
6. [ ] Keep span hierarchy intentional (one entry point + LLM child).
7. [ ] Stamp harness I/O as `overmind.input.data` / `overmind.output.data` (not plain `input`/`output`).
8. [ ] Shape `gen_ai.input/output.messages` as **parts-based** semconv (`parts: [{type:"text", content}]`).
9. [ ] Stamp `gen_ai.request.temperature` / response_format / limits for visibility.
10. [ ] Prove with `normalize_spans` / live scoring that `final_output` is non-empty — not only that raw attrs exist on the span.
11. [ ] If card-constraints abstain, check compiled constraint **params** before blaming instrumentation.

---

## Repro notes (this repo)

- Command: `npm run run:20-emails`
- Trace `b3edf721…`: export OK; scoring empty (wrong/missing I/O shape).
- Trace `70c39d8b…`: attrs present (`output`, `gen_ai.*`) but normalizer still empty — Gaps 10–11.
- After Gaps 10–11: re-run and confirm normalized `final_output` is non-empty and Live Task Success can resolve fields.
