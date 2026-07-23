import type { RawEmail } from "@/lib/gmail";
import { analyzeEmailWithLlm, requireLlmConfigured } from "@/lib/agent/llm";
import { withEntryPointSpan } from "@/lib/telemetry";
import type { InvoiceRecord } from "@/lib/types";

const toGmailUrl = (emailId: string, source: "gmail" | "demo") =>
  source === "demo"
    ? "#"
    : `https://mail.google.com/mail/u/0/#inbox/${emailId}`;

export const analyzeEmail = async (
  email: RawEmail,
  source: "gmail" | "demo",
): Promise<InvoiceRecord | null> =>
  withEntryPointSpan(
    "analyzeEmail",
    { email, source },
    async () => {
      const combinedText = [
        email.subject,
        email.snippet,
        email.bodyText,
        ...email.attachmentTexts,
      ]
        .filter(Boolean)
        .join("\n");

      const llm = await analyzeEmailWithLlm({
        subject: email.subject,
        from: email.from,
        date: email.date,
        text: combinedText,
      });

      if (!llm.isInvoice) return null;

      return {
        id: `${source}-${email.id}`,
        emailId: email.id,
        threadId: email.threadId || undefined,
        subject: email.subject,
        from: email.from,
        vendor: llm.vendor || "Unknown vendor",
        receivedAt: new Date(email.date).toISOString(),
        amount:
          llm.amount != null
            ? {
                value: llm.amount,
                currency: llm.currency || "USD",
                raw: `${llm.currency || "USD"} ${llm.amount}`,
              }
            : null,
        dueDate: llm.dueDate,
        invoiceNumber: llm.invoiceNumber,
        confidence: Number(llm.confidence.toFixed(2)),
        summary: llm.summary || email.snippet || email.subject,
        gmailUrl: toGmailUrl(email.id, source),
        source,
      };
    },
  );

export const runInvoiceAgent = async (
  emails: RawEmail[],
  source: "gmail" | "demo",
) => {
  requireLlmConfigured();

  const invoices: InvoiceRecord[] = [];

  for (const email of emails) {
    const record = await analyzeEmail(email, source);
    if (record) invoices.push(record);
  }

  invoices.sort((a, b) => {
    const aDue = a.dueDate || "9999-12-31";
    const bDue = b.dueDate || "9999-12-31";
    return aDue.localeCompare(bDue);
  });

  return invoices;
};
