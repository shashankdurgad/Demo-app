import { trace, SpanStatusCode } from "@opentelemetry/api";
import { NextRequest, NextResponse } from "next/server";
import { isLlmConfigured } from "@/lib/agent/llm";
import { runInvoiceAgent } from "@/lib/agent/triage";
import { DEMO_EMAILS } from "@/lib/demo-emails";
import { fetchCandidateEmails } from "@/lib/gmail";
import { ensureOvermindTracing } from "@/lib/overmind";
import { getSession } from "@/lib/session";
import type { ScanResult } from "@/lib/types";

export const runtime = "nodejs";

const handleScanPost = async (request: NextRequest) => {
  if (!isLlmConfigured()) {
    return NextResponse.json(
      {
        error:
          "LLM required. Add OPENAI_API_KEY or OLLAMA_BASE_URL to .env.local and restart.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "gmail" | "demo";
    maxResults?: number;
  };

  const mode = body.mode || "gmail";

  try {
    if (mode === "demo") {
      const invoices = await runInvoiceAgent(DEMO_EMAILS, "demo");
      const result: ScanResult = {
        scanned: DEMO_EMAILS.length,
        invoices,
        mode: "demo",
        scannedAt: new Date().toISOString(),
      };
      return NextResponse.json(result);
    }

    const session = await getSession();
    if (!session.tokens?.access_token) {
      return NextResponse.json(
        { error: "Connect Gmail with read access first, or use Demo mode." },
        { status: 401 },
      );
    }

    const emails = await fetchCandidateEmails(session.tokens, {
      maxResults: body.maxResults ?? 25,
    });
    const invoices = await runInvoiceAgent(emails, "gmail");
    const result: ScanResult = {
      scanned: emails.length,
      invoices,
      mode: "gmail",
      scannedAt: new Date().toISOString(),
    };
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to run invoice LLM agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const POST = async (request: NextRequest) => {
  ensureOvermindTracing();
  const tracer = trace.getTracer("ledgerline-invoice-triage");
  return tracer.startActiveSpan("HTTP scan API entrypoint", async (span) => {
    span.setAttribute("overmind.span.type", "entry_point");
    span.setAttribute("overmind.agent.name", "Ledgerline Invoice Triage Agent");
    span.setAttribute("inputs", JSON.stringify({ method: request.method, url: request.url }));
    try {
      const result = await handleScanPost(request);
      span.setAttribute("outputs", JSON.stringify({ status: result.status }));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    }
  });
};
