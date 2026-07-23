import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-4o-mini";

/**
 * Each email runs a fixed 3-step LLM pipeline (classify → extract|reject → finalize).
 * Mock returns one response per fetch in that order.
 */
const pipelineByEmail = new Map([
  [
    "demo-1",
    [
      { isInvoice: true, summary: "Northwind payable invoice", confidence: 0.92 },
      {
        vendor: "Northwind",
        amount: 1240.5,
        currency: "GBP",
        dueDate: "2026-07-31",
        invoiceNumber: "INV-1042",
        summary: "Northwind invoice INV-1042",
        confidence: 0.92,
      },
      { apNote: "Pay Northwind INV-1042 £1240.50 by 2026-07-31." },
    ],
  ],
  [
    "demo-2",
    [
      { isInvoice: true, summary: "AWS payable invoice", confidence: 0.9 },
      {
        vendor: "Amazon",
        amount: 312.88,
        currency: "USD",
        dueDate: "2026-07-20",
        invoiceNumber: "123456789",
        summary: "AWS invoice",
        confidence: 0.9,
      },
      { apNote: "Schedule AWS invoice 123456789 for $312.88." },
    ],
  ],
  [
    "demo-3",
    [
      { isInvoice: false, summary: "Personal lunch email", confidence: 0.95 },
      {
        vendor: null,
        amount: null,
        currency: null,
        dueDate: null,
        invoiceNumber: null,
        summary: "Personal lunch email",
        confidence: 0.95,
        rationale: "Personal chat, not a payable invoice.",
      },
      { apNote: "No AP action — personal lunch thread." },
    ],
  ],
  [
    "demo-4",
    [
      { isInvoice: false, summary: "Paid Figma receipt", confidence: 0.93 },
      {
        vendor: null,
        amount: null,
        currency: null,
        dueDate: null,
        invoiceNumber: null,
        summary: "Paid receipt",
        confidence: 0.93,
        rationale: "Already-paid receipt, not payable.",
      },
      { apNote: "Ignore — Figma receipt already paid." },
    ],
  ],
  [
    "demo-5",
    [
      { isInvoice: true, summary: "Cloudhost payable invoice", confidence: 0.91 },
      {
        vendor: "Cloudhost",
        amount: 890,
        currency: "EUR",
        dueDate: "2026-07-16",
        invoiceNumber: "7781",
        summary: "Cloudhost invoice 7781",
        confidence: 0.91,
      },
      { apNote: "Pay Cloudhost 7781 €890 by 2026-07-16." },
    ],
  ],
]);

const defaultNonInvoicePipeline = [
  { isInvoice: false, summary: "Not a payable invoice", confidence: 0.9 },
  {
    vendor: null,
    amount: null,
    currency: null,
    dueDate: null,
    invoiceNumber: null,
    summary: "Not a payable invoice",
    confidence: 0.9,
    rationale: "Does not look like a payable invoice.",
  },
  { apNote: "No AP action required." },
];

const { DEMO_EMAILS } = await import("../src/lib/demo-emails.ts");

/** Flat queue: 3 mock responses per demo email, in corpus order. */
const responseQueue = DEMO_EMAILS.flatMap((email) => {
  const pipeline = pipelineByEmail.get(email.id) || defaultNonInvoicePipeline;
  return [...pipeline];
});

let callIndex = 0;

globalThis.fetch = async () => {
  const payload = responseQueue[callIndex++] || defaultNonInvoicePipeline[0];
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  };
};

const { runInvoiceAgent } = await import("../src/lib/agent/triage.ts");
const { isLlmConfigured, requireLlmConfigured } = await import(
  "../src/lib/agent/llm.ts"
);

assert.equal(isLlmConfigured(), true);
requireLlmConfigured();

const invoices = await runInvoiceAgent(DEMO_EMAILS, "demo");
assert.equal(invoices.length, 3);
assert.ok(!invoices.some((invoice) => invoice.subject.includes("Team lunch")));
assert.ok(!invoices.some((invoice) => invoice.vendor === "Figma"));
assert.equal(
  invoices.find((invoice) => invoice.vendor === "Amazon")?.invoiceNumber,
  "123456789",
);
assert.equal(
  invoices.find((invoice) => invoice.vendor === "Northwind")?.amount?.value,
  1240.5,
);
// 20 emails × 3 LLM steps
assert.equal(callIndex, DEMO_EMAILS.length * 3);

console.log(
  "LLM agent verification passed:",
  invoices.map((invoice) => ({
    vendor: invoice.vendor,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
  })),
);
console.log(`Mock LLM calls: ${callIndex} (3 per email × ${DEMO_EMAILS.length})`);
