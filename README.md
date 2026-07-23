# Ledgerline — LLM Invoice Email Agent

Local Next.js app that connects to Gmail with **read-only** access and uses an **LLM** to:

- triage which emails are invoices
- extract how much each invoice is for
- extract when payment is due

There is no heuristic fallback — scanning requires a model API key (or local Ollama).

## Quick start

```bash
npm install
cp .env.example .env.local
```

Add at least one LLM config to `.env.local`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Or for a fully local model:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use **Run demo scan** to test the LLM on sample emails, or connect Gmail for real inbox data.

## Connect Gmail (read-only)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen (External is fine for personal use; add your Google account as a test user).
4. Create OAuth credentials → **Web application**.
5. Add authorized redirect URI:
   `http://localhost:3000/api/auth/callback`
6. Put the client ID/secret into `.env.local` (see `.env.example`).
7. Restart `npm run dev`, then click **Connect Gmail (read-only)**.

Requested scopes:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

Tokens are stored in an encrypted httpOnly session cookie on your machine.

## How the agent works

1. Loads recent inbox emails (+ PDF attachment text when present)
2. Sends each email to the LLM for triage + extraction
3. Keeps only messages the model marks as payable invoices
4. Shows vendor, amount, due date, invoice number, and confidence

## Scripts

```bash
npm run dev           # local UI + API
npm run build         # production build
npm run start         # serve production build
npm run lint
npm run verify:agent  # mocked LLM unit check
npm run run:20-emails # demo corpus through analyzeEmail (+ Overmind traces)
```

## Overmind telemetry

When `OVERMIND_API_KEY` is set, each `analyzeEmail` call exports one OTLP trace to
Overmind (`entry_point` harness span + child `llm_call` with raw extraction JSON).
Tracing is a no-op if the key is unset. See `.env.example` for optional
`OVERMIND_AGENT_ID` / `OVERMIND_AGENT_NAME` / `OVERMIND_ENVIRONMENT`.
