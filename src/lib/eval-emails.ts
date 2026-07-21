import type { RawEmail } from "@/lib/gmail";

/**
 * Gold labels for evaluation. Field expectations are soft where noted —
 * `isInvoice` is the primary triage label.
 */
export type EvalGoldLabel = {
  isInvoice: boolean;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  /** ISO date when a clear due date exists */
  dueDate?: string | null;
  /** Why this scenario is interesting for eval */
  notes: string;
};

export type EvalScenario = {
  email: RawEmail;
  expected: EvalGoldLabel;
};

const d = (
  day: number,
  month = 7,
  year = 2026,
  hour = 10,
  minute = 0,
) => {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${weekdays[date.getUTCDay()]}, ${String(date.getUTCDate()).padStart(2, "0")} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:00 +0000`;
};

/**
 * 50 handcrafted evaluation scenarios — deliberately different from the
 * procedural gen-* corpus (edge cases, ambiguous mail, niche industries).
 */
export const EVAL_SCENARIOS_50: EvalScenario[] = [
  {
    email: {
      id: "eval-1",
      threadId: "eval-thread-1",
      subject: "FINAL NOTICE — water account 88219 past due",
      from: "Collections <collections@metro-water.example>",
      date: d(3, 7, 2026, 7, 12),
      snippet: "Balance overdue $214.67 — shutoff scheduled",
      bodyText: `
Metro Water Utility — Past Due Notice

Account: 88219
Previous balance: $198.00
Late fee: $16.67
Amount now due: $214.67 USD
Original due date: June 15, 2026
Shutoff date if unpaid: July 12, 2026

Pay immediately to avoid interruption.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Metro Water Utility",
      amount: 214.67,
      currency: "USD",
      dueDate: "2026-07-12",
      notes: "Dunning / past-due utility with shutoff date",
    },
  },
  {
    email: {
      id: "eval-2",
      threadId: "eval-thread-2",
      subject: "Proforma invoice PF-4401 for staging servers",
      from: "RackForge Sales <sales@rackforge.example>",
      date: d(4, 7, 2026, 11, 5),
      snippet: "Proforma PF-4401 — €3,900 provisional",
      bodyText: `
RackForge — PROFORMA INVOICE (not a tax invoice)

Proforma #: PF-4401
Estimated total: EUR 3,900.00
Valid until: 31 July 2026

This is a quotation-style proforma for budgeting only.
A formal tax invoice will be issued after order confirmation.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      vendor: "RackForge",
      amount: null,
      currency: null,
      dueDate: null,
      notes: "Proforma / quote — explicitly not a payable tax invoice",
    },
  },
  {
    email: {
      id: "eval-3",
      threadId: "eval-thread-3",
      subject: "Credit note CN-77 applied to your account",
      from: "billing@paperlane.example",
      date: d(5, 7, 2026, 9, 40),
      snippet: "Credit note CN-77 for £420.00",
      bodyText: `
Paperlane Ltd — CREDIT NOTE CN-77

Reason: Overbilled toner shipment returned
Credit amount: £420.00 GBP
Applied to account: LEDGER-DEMO

No payment is requested. This reduces your balance.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      vendor: "Paperlane Ltd",
      amount: null,
      currency: null,
      dueDate: null,
      notes: "Credit note — money owed to customer, not a payable invoice",
    },
  },
  {
    email: {
      id: "eval-4",
      threadId: "eval-thread-4",
      subject: "Quote Q-2290 — office fit-out (please approve)",
      from: "estimates@buildright.example",
      date: d(6, 7, 2026, 14, 22),
      snippet: "Quote total $28,450 — awaiting PO",
      bodyText: `
BuildRight Interiors — QUOTATION Q-2290

Scope: Open-plan desks + meeting room AV
Quoted total: $28,450.00 USD
Quote valid through: August 1, 2026

This is a quote only. No invoice has been issued.
Reply with a PO number to proceed.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Sales quote awaiting PO — not payable",
    },
  },
  {
    email: {
      id: "eval-5",
      threadId: "eval-thread-5",
      subject: "Statement of account — June 2026",
      from: "ar@steelworks.example",
      date: d(7, 7, 2026, 8, 0),
      snippet: "Open balance $6,120.00 across 3 invoices",
      bodyText: `
Steelworks AR — Statement of Account

Customer: Ledgerline Demo
Period: June 2026

INV-901  $2,100.00  due 2026-07-10
INV-914  $1,820.00  due 2026-07-18
INV-930  $2,200.00  due 2026-07-25

Total outstanding: $6,120.00 USD
Please settle open invoices individually; this email is a summary statement.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Steelworks",
      amount: 6120,
      currency: "USD",
      dueDate: "2026-07-10",
      notes: "Statement with multiple open invoices; treat as payable aggregate",
    },
  },
  {
    email: {
      id: "eval-6",
      threadId: "eval-thread-6",
      subject: "Application for Payment No. 3 — Riverside Fitout",
      from: "pm@harbour-construction.example",
      date: d(8, 7, 2026, 16, 10),
      snippet: "Progress billing AFP-3: £41,250 due Net 14",
      bodyText: `
Harbour Construction — Application for Payment No. 3

Project: Riverside Fitout
Period ending: 30 June 2026
Certified amount this period: £41,250.00 GBP
Payment due: 22 July 2026 (Net 14 from certification)

Please arrange payment per contract schedule of values.
`.trim(),
      attachmentTexts: [
        "AFP-3\nCertified amount due: GBP 41250.00\nDue: 2026-07-22\n",
      ],
    },
    expected: {
      isInvoice: true,
      vendor: "Harbour Construction",
      amount: 41250,
      currency: "GBP",
      dueDate: "2026-07-22",
      notes: "Construction progress / application for payment",
    },
  },
  {
    email: {
      id: "eval-7",
      threadId: "eval-thread-7",
      subject: "Patient statement — visit 14 June",
      from: "billing@riverside-dental.example",
      date: d(9, 7, 2026, 12, 45),
      snippet: "Patient responsibility $186.40 after insurance",
      bodyText: `
Riverside Dental Clinic — Patient Billing Statement

Visit date: 14 June 2026
Insurance paid: $410.00
Patient responsibility (amount due): $186.40 USD
Due by: 31 July 2026
Invoice/claim ref: RD-55102

Please pay the patient portion online or by card.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Riverside Dental Clinic",
      amount: 186.4,
      currency: "USD",
      dueDate: "2026-07-31",
      notes: "Medical/dental patient responsibility bill",
    },
  },
  {
    email: {
      id: "eval-8",
      threadId: "eval-thread-8",
      subject: "Special assessment — Building B elevator repair",
      from: "board@oakcourt-hoa.example",
      date: d(10, 7, 2026, 18, 30),
      snippet: "HOA assessment $1,250 due August 15",
      bodyText: `
Oak Court HOA — Special Assessment Notice

Unit: 4B
Purpose: Elevator modernization
Assessment amount due: $1,250.00 USD
Due date: August 15, 2026
Reference: HOA-SA-2026-04

Payable to Oak Court HOA Operating Account.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Oak Court HOA",
      amount: 1250,
      currency: "USD",
      dueDate: "2026-08-15",
      notes: "HOA special assessment — payable obligation",
    },
  },
  {
    email: {
      id: "eval-9",
      threadId: "eval-thread-9",
      subject: "PCN UK808812 — Congestion Charge unpaid",
      from: "TfL Penalties <noreply@tfl.example>",
      date: d(2, 7, 2026, 6, 55),
      snippet: "Penalty Charge Notice £160 (reduced £80 if paid in 14 days)",
      bodyText: `
Transport for London — Penalty Charge Notice

PCN: UK808812
Contravention: Unpaid Congestion Charge
Full amount: £160.00
Reduced if paid within 14 days: £80.00
Pay by: 16 July 2026 for reduced rate

This is a penalty, not a commercial invoice, but payment is owed.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Transport for London",
      amount: 80,
      currency: "GBP",
      dueDate: "2026-07-16",
      notes: "Government fine / PCN — payable; reduced amount if timely",
    },
  },
  {
    email: {
      id: "eval-10",
      threadId: "eval-thread-10",
      subject: "Tax Invoice — GST inclusive — INV-AU-330",
      from: "accounts@sydney-print.example",
      date: d(11, 7, 2026, 1, 20),
      snippet: "AUD 1,100.00 incl GST due 25 July",
      bodyText: `
Sydney Print Co — TAX INVOICE INV-AU-330
ABN 12 345 678 901

Supply: Brochure run 5k
Subtotal (ex GST): AUD 1,000.00
GST 10%: AUD 100.00
Total amount payable: AUD 1,100.00
Due date: 25 July 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Sydney Print Co",
      amount: 1100,
      currency: "AUD",
      dueDate: "2026-07-25",
      notes: "Australian GST tax invoice — currency AUD",
    },
  },
  {
    email: {
      id: "eval-11",
      threadId: "eval-thread-11",
      subject: "Intercompany charge IC-2026-88 (Ledgerline UK → US)",
      from: "finance@ledgerline-holdings.example",
      date: d(12, 7, 2026, 15, 0),
      snippet: "IC charge $9,400 shared engineering",
      bodyText: `
Ledgerline Holdings — Intercompany Charge IC-2026-88

From: Ledgerline UK Ltd
To: Ledgerline US Inc
Description: Shared platform engineering June
Amount due: $9,400.00 USD
Settlement due: 31 July 2026

Internal recharge — still a payable obligation for the receiving entity.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Ledgerline UK Ltd",
      amount: 9400,
      currency: "USD",
      dueDate: "2026-07-31",
      notes: "Intercompany recharge — still payable",
    },
  },
  {
    email: {
      id: "eval-12",
      threadId: "eval-thread-12",
      subject: "Your Notion renewal is coming up (no charge yet)",
      from: "Notion <team@notion.so>",
      date: d(13, 7, 2026, 10, 10),
      snippet: "Plan renews August 1 — update payment method",
      bodyText: `
Hi,

Your Notion Business plan renews on August 1, 2026.
Estimated charge: $96.00

No invoice has been generated yet. This is a renewal reminder only.
Update your card if needed before the renewal date.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Renewal reminder before billing — not yet an invoice",
    },
  },
  {
    email: {
      id: "eval-13",
      threadId: "eval-thread-13",
      subject: "Collection agency assignment — File CA-4419",
      from: "Harbor Collections <ops@harbor-collections.example>",
      date: d(14, 7, 2026, 9, 5),
      snippet: "Original creditor Cloudhost — balance $890 now with us",
      bodyText: `
Harbor Collections LLC

We have been assigned the following debt:
Original creditor: Cloudhost Ltd
Original invoice: 7781
Principal balance due: $890.00 USD
Pay Harbor Collections by: 5 August 2026

Contact us to arrange payment or dispute.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Harbor Collections",
      amount: 890,
      currency: "USD",
      dueDate: "2026-08-05",
      notes: "Third-party collections on assigned invoice",
    },
  },
  {
    email: {
      id: "eval-14",
      threadId: "eval-thread-14",
      subject: "Partial payment request on INV-28419",
      from: "Stripe Billing <invoices@stripe.com>",
      date: d(15, 7, 2026, 13, 40),
      snippet: "Remaining balance $499.00 after partial pay",
      bodyText: `
Stripe, Inc. — Balance update for INV-28419

Original amount: $1,499.00
Payment received: $1,000.00 on July 10
Remaining amount due: $499.00 USD
Due date (unchanged): August 1, 2026

Please pay the remaining balance.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Stripe, Inc.",
      amount: 499,
      currency: "USD",
      dueDate: "2026-08-01",
      notes: "Partial payment — remaining balance still payable",
    },
  },
  {
    email: {
      id: "eval-15",
      threadId: "eval-thread-15",
      subject: "Scan of invoice (PDF only)",
      from: "ops@glacier-hvac.example",
      date: d(1, 7, 2026, 11, 11),
      snippet: "Attached HVAC invoice — body intentionally blank",
      bodyText: `Please see attached PDF for our invoice. Thanks.`,
      attachmentTexts: [
        `
GLACIER HVAC
INVOICE GH-6621
Service call — rooftop unit
Amount due: $640.00 USD
Due date: July 28, 2026
`,
      ],
    },
    expected: {
      isInvoice: true,
      vendor: "Glacier HVAC",
      amount: 640,
      currency: "USD",
      dueDate: "2026-07-28",
      notes: "Amount/due date only in attachment text",
    },
  },
  {
    email: {
      id: "eval-16",
      threadId: "eval-thread-16",
      subject: "Fwd: Invoice AA-909 from Apex",
      from: "ceo@ledgerline.example",
      date: d(16, 7, 2026, 19, 2),
      snippet: "FYI — please pay this",
      bodyText: `
---------- Forwarded message ----------
From: billing@apex-advisory.example
Subject: Consulting invoice attached — Apex Advisory

Attached is our consulting invoice for Q2 strategy work.
Please arrange payment by the due date on the PDF.
`.trim(),
      attachmentTexts: [
        `
APEX ADVISORY LLC
INVOICE AA-909
Consulting services — Q2 2026
Total amount due: $4,500.00 USD
Due date: August 12, 2026
`,
      ],
    },
    expected: {
      isInvoice: true,
      vendor: "Apex Advisory",
      amount: 4500,
      currency: "USD",
      dueDate: "2026-08-12",
      notes: "Forwarded invoice chain — still payable",
    },
  },
  {
    email: {
      id: "eval-17",
      threadId: "eval-thread-17",
      subject: "Facture FA-2026-091 — prestations de conseil",
      from: "compta@atelier-nord.example",
      date: d(17, 7, 2026, 8, 45),
      snippet: "Montant TTC 2 480,00 € — échéance 30/07/2026",
      bodyText: `
Atelier Nord SARL — FACTURE FA-2026-091

Prestations de conseil — juin 2026
Montant HT: 2 066,67 €
TVA 20%: 413,33 €
Montant TTC à payer: 2 480,00 €
Date d'échéance: 30/07/2026

Merci de régler par virement.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Atelier Nord",
      amount: 2480,
      currency: "EUR",
      dueDate: "2026-07-30",
      notes: "French-language tax invoice (facture)",
    },
  },
  {
    email: {
      id: "eval-18",
      threadId: "eval-thread-18",
      subject: "Zero-value invoice ZV-12 for license key issuance",
      from: "billing@keysmith.example",
      date: d(18, 7, 2026, 10, 0),
      snippet: "Invoice ZV-12 total $0.00",
      bodyText: `
Keysmith Software — INVOICE ZV-12

Item: Enterprise license key re-issue (warranty)
Amount due: $0.00 USD
Due date: N/A

No payment required. Issued for audit trail only.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Zero-amount administrative invoice — nothing payable",
    },
  },
  {
    email: {
      id: "eval-19",
      threadId: "eval-thread-19",
      subject: "Refund processed — Order #88421",
      from: "returns@shopfast.example",
      date: d(19, 7, 2026, 12, 12),
      snippet: "We refunded $72.50 to your card",
      bodyText: `
ShopFast — Refund Confirmation

Order: #88421
Refund amount: $72.50 USD
Status: Completed
Posted to Visa •••• 4242

This confirms money returned to you. Not a bill.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Refund confirmation — opposite cash direction",
    },
  },
  {
    email: {
      id: "eval-20",
      threadId: "eval-thread-20",
      subject: "Purchase Order PO-55018 for approval",
      from: "procurement@ledgerline.example",
      date: d(20, 7, 2026, 9, 30),
      snippet: "PO-55018 total $12,000 — internal approval",
      bodyText: `
Internal Purchase Order PO-55018

Vendor: Orbit Analytics
Requested items: Annual seat expansion
PO total: $12,000.00 USD
Requester: Ops

This is our outbound PO, not a vendor invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Outbound purchase order — not a vendor bill",
    },
  },
  {
    email: {
      id: "eval-21",
      threadId: "eval-thread-21",
      subject: "Updated wire instructions for INV-1042",
      from: "billing@northwind.example",
      date: d(21, 6, 2026, 15, 15),
      snippet: "New IBAN for invoice INV-1042",
      bodyText: `
Northwind Supplies

Please use the updated bank details when paying invoice INV-1042.
IBAN: GB29 NWBK 6016 1331 9268 19
BIC: NWBKGB2L

This email does not restate the amount due — refer to the original invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Wire instruction update without amount — incomplete as standalone invoice",
    },
  },
  {
    email: {
      id: "eval-22",
      threadId: "eval-thread-22",
      subject: "Retainer invoice — July engagement",
      from: "billing@kim-wallace-llp.example",
      date: d(22, 6, 2026, 11, 0),
      snippet: "Retainer INV-KW-701 $7,500 due on receipt",
      bodyText: `
Kim & Wallace LLP — RETAINER INVOICE INV-KW-701

Matter: Corporate financing advisory
Retainer amount due: $7,500.00 USD
Due: upon receipt (please pay by 5 July 2026)

Unused retainer remains client property on trust account.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Kim & Wallace LLP",
      amount: 7500,
      currency: "USD",
      dueDate: "2026-07-05",
      notes: "Legal retainer invoice — payable",
    },
  },
  {
    email: {
      id: "eval-23",
      threadId: "eval-thread-23",
      subject: "July rent invoice — Unit 12 Canal Wharf",
      from: "property@canalwharf.example",
      date: d(1, 7, 2026, 6, 0),
      snippet: "Rent £2,850 due 1st of month",
      bodyText: `
Canal Wharf Management — Rent Invoice RW-2026-07

Tenant: Ledgerline Demo
Unit: 12
Period: 1–31 July 2026
Rent due: £2,850.00 GBP
Due date: 1 July 2026

Standing order preferred.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Canal Wharf Management",
      amount: 2850,
      currency: "GBP",
      dueDate: "2026-07-01",
      notes: "Commercial rent invoice",
    },
  },
  {
    email: {
      id: "eval-24",
      threadId: "eval-thread-24",
      subject: "Business insurance premium due — Policy BX-440",
      from: "premiums@shieldmutual.example",
      date: d(23, 6, 2026, 7, 45),
      snippet: "Premium $1,980 due 20 July",
      bodyText: `
Shield Mutual — Premium Notice

Policy: BX-440 (Commercial Liability)
Installment amount due: $1,980.00 USD
Due date: 20 July 2026
Invoice #: SM-PR-8891

Coverage may lapse if unpaid.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Shield Mutual",
      amount: 1980,
      currency: "USD",
      dueDate: "2026-07-20",
      notes: "Insurance premium notice as payable invoice",
    },
  },
  {
    email: {
      id: "eval-25",
      threadId: "eval-thread-25",
      subject: "Invoice — DevSum Conference pass (company)",
      from: "billing@devsum.example",
      date: d(24, 6, 2026, 14, 0),
      snippet: "Conference invoice DS-4412 €890",
      bodyText: `
DevSum 2026 — Registration Invoice DS-4412

Attendee: Alex Rivera (Ledgerline)
Ticket: Full conference + workshops
Amount due: €890.00 EUR
Payment due: 15 July 2026

Pay by card or bank transfer.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "DevSum",
      amount: 890,
      currency: "EUR",
      dueDate: "2026-07-15",
      notes: "Conference registration invoice",
    },
  },
  {
    email: {
      id: "eval-26",
      threadId: "eval-thread-26",
      subject: "Tuition invoice Fall 2026 — Student 400291",
      from: "bursar@northbridge-uni.example",
      date: d(25, 6, 2026, 8, 8),
      snippet: "Tuition & fees $8,420 due Aug 1",
      bodyText: `
Northbridge University — Bursar Invoice TU-400291-F26

Student ID: 400291
Fall 2026 tuition: $7,800.00
Campus fees: $620.00
Total amount due: $8,420.00 USD
Due date: August 1, 2026

Late fees apply after the due date.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Northbridge University",
      amount: 8420,
      currency: "USD",
      dueDate: "2026-08-01",
      notes: "University tuition bill",
    },
  },
  {
    email: {
      id: "eval-27",
      threadId: "eval-thread-27",
      subject: "Donation receipt — thank you for $250",
      from: "donations@greenpath-charity.example",
      date: d(26, 6, 2026, 17, 20),
      snippet: "Tax receipt for your gift",
      bodyText: `
GreenPath Charity — Donation Receipt

Gift amount: $250.00 USD
Date received: 26 June 2026
Receipt #: GP-D-90881

No goods or services were provided. This is a donation receipt, not a bill.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Nonprofit donation receipt — not payable",
    },
  },
  {
    email: {
      id: "eval-28",
      threadId: "eval-thread-28",
      subject: "Expense reimbursement approved — $186.20",
      from: "expenses@ledgerline.example",
      date: d(27, 6, 2026, 12, 0),
      snippet: "We will deposit $186.20 to your account",
      bodyText: `
Ledgerline Expenses

Your report ER-331 was approved.
Reimbursement amount: $186.20 USD
Expected deposit: 3 business days

We owe you — this is not a vendor invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Employee reimbursement — cash out from company",
    },
  },
  {
    email: {
      id: "eval-29",
      threadId: "eval-thread-29",
      subject: "W-9 request before we can pay you",
      from: "ap@brightline.example",
      date: d(28, 6, 2026, 10, 40),
      snippet: "Please send W-9 for vendor onboarding",
      bodyText: `
Brightline Telecom Accounts Payable

Before we can process payments to your company, please complete and return a W-9.
No invoice is attached. This is an onboarding request only.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Tax form request — not an invoice",
    },
  },
  {
    email: {
      id: "eval-30",
      threadId: "eval-thread-30",
      subject: "Chargeback opened — Dispute CB-2291",
      from: "disputes@payprocessor.example",
      date: d(29, 6, 2026, 21, 5),
      snippet: "Cardholder disputed $312.88",
      bodyText: `
PayProcessor — Chargeback Notice CB-2291

Original payment: $312.88 USD (AWS invoice)
Reason code: Merchandise not received
Response due: 12 July 2026

This is a payment dispute notice, not a new bill to pay.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Chargeback / dispute notice — not a payable invoice",
    },
  },
  {
    email: {
      id: "eval-31",
      threadId: "eval-thread-31",
      subject: "Escrow disbursement schedule — closing file E-778",
      from: "escrow@titlebridge.example",
      date: d(30, 6, 2026, 9, 50),
      snippet: "Disbursements totaling $120,000",
      bodyText: `
TitleBridge Escrow

File E-778 closing disbursements will be released to sellers and lienholders.
Total escrowed: $120,000.00 USD

You are not being billed. This is a closing notification.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Escrow disbursement notice — not a bill",
    },
  },
  {
    email: {
      id: "eval-32",
      threadId: "eval-thread-32",
      subject: "Customs duty invoice — Entry 2026-441902",
      from: "duties@portbroker.example",
      date: d(2, 7, 2026, 5, 30),
      snippet: "Import duties $1,045.55 due before release",
      bodyText: `
PortBroker Customs — Duty Invoice CDI-441902

Entry #: 2026-441902
Merchandise: Lab equipment
Customs duty + fees due: $1,045.55 USD
Pay by: 8 July 2026 to avoid demurrage

Goods will not clear until paid.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "PortBroker Customs",
      amount: 1045.55,
      currency: "USD",
      dueDate: "2026-07-08",
      notes: "Customs / import duty invoice",
    },
  },
  {
    email: {
      id: "eval-33",
      threadId: "eval-thread-33",
      subject: "WeWork invoice — August membership",
      from: "billing@wework.example",
      date: d(3, 7, 2026, 8, 20),
      snippet: "Hot desk membership $450 due Aug 1",
      bodyText: `
WeWork — Membership Invoice WW-88902

Location: Shoreditch
Plan: Hot desk (4 days/week)
Amount due: $450.00 USD
Due date: August 1, 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "WeWork",
      amount: 450,
      currency: "USD",
      dueDate: "2026-08-01",
      notes: "Coworking membership invoice",
    },
  },
  {
    email: {
      id: "eval-34",
      threadId: "eval-thread-34",
      subject: "Creator invoice — July campaign deliverables",
      from: "finance@luna-creates.example",
      date: d(4, 7, 2026, 19, 40),
      snippet: "Influencer invoice LC-204 €2,200",
      bodyText: `
Luna Creates — INVOICE LC-204

Deliverables: 3 Reels + usage rights (July campaign)
Amount due: €2,200.00 EUR
Due date: 21 July 2026
Net 14 from delivery acceptance.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Luna Creates",
      amount: 2200,
      currency: "EUR",
      dueDate: "2026-07-21",
      notes: "Influencer / creator services invoice",
    },
  },
  {
    email: {
      id: "eval-35",
      threadId: "eval-thread-35",
      subject: "ACH authorization confirmation on file",
      from: "payments@cloudhost.example",
      date: d(5, 7, 2026, 7, 0),
      snippet: "Your ACH mandate is active",
      bodyText: `
Cloudhost Ltd

We confirmed your ACH bank mandate for future invoices.
No charge was taken today. You will receive separate invoices when amounts are due.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Payment method authorization — no amount due",
    },
  },
  {
    email: {
      id: "eval-36",
      threadId: "eval-thread-36",
      subject: "Estimated electricity bill — meter estimated",
      from: "billing@gridco.example",
      date: d(6, 7, 2026, 6, 40),
      snippet: "Estimated bill $231.20 — pay or submit reading",
      bodyText: `
GridCo Energy — Estimated Bill EB-90211

Meter could not be read.
Estimated usage charge due: $231.20 USD
Pay by: 24 July 2026
Or submit an actual reading to revise before payment.

This remains payable unless superseded by a revised bill.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "GridCo Energy",
      amount: 231.2,
      currency: "USD",
      dueDate: "2026-07-24",
      notes: "Estimated utility bill — still payable",
    },
  },
  {
    email: {
      id: "eval-37",
      threadId: "eval-thread-37",
      subject: "Self-billed invoice SBI-55 (buyer-created)",
      from: "ap@ledgerline.example",
      date: d(7, 7, 2026, 13, 13),
      snippet: "Self-bill for contractor hours £1,680",
      bodyText: `
Ledgerline AP — Self-Billed Invoice SBI-55

Issued under self-billing agreement with Nova Freelance Ltd
Hours: 24 @ £70
Amount we will pay: £1,680.00 GBP
Payment date scheduled: 28 July 2026

Buyer-created tax invoice documenting our payable to the contractor.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Nova Freelance Ltd",
      amount: 1680,
      currency: "GBP",
      dueDate: "2026-07-28",
      notes: "Self-billed invoice — still a payable record",
    },
  },
  {
    email: {
      id: "eval-38",
      threadId: "eval-thread-38",
      subject: "Notice of assignment — pay factor instead of vendor",
      from: "notice@rapidfactor.example",
      date: d(8, 7, 2026, 11, 25),
      snippet: "Invoice INV-914 assigned — pay RapidFactor $1,820",
      bodyText: `
RapidFactor — Notice of Assignment

Steelworks has assigned invoice INV-914 to RapidFactor.
Amount due: $1,820.00 USD
Due date: 18 July 2026

Make payment only to RapidFactor to discharge the debt.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "RapidFactor",
      amount: 1820,
      currency: "USD",
      dueDate: "2026-07-18",
      notes: "Factoring assignment — pay factor for assigned invoice",
    },
  },
  {
    email: {
      id: "eval-39",
      threadId: "eval-thread-39",
      subject: "Re: duplicate invoice INV-1042 — please void the second",
      from: "ap@ledgerline.example",
      date: d(9, 7, 2026, 16, 50),
      snippet: "We received INV-1042 twice",
      bodyText: `
Hi Northwind,

We were billed twice for INV-1042 (£1,240.50). Please void the duplicate.
We will pay the original once. No new amount is being requested in this thread.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Dispute / duplicate discussion — not a new payable invoice",
    },
  },
  {
    email: {
      id: "eval-40",
      threadId: "eval-thread-40",
      subject: "Usage overrun invoice — API calls May",
      from: "billing@orbit-analytics.example",
      date: d(10, 7, 2026, 4, 15),
      snippet: "Overage INV-OA-771 $327.40 due July 31",
      bodyText: `
Orbit Analytics — Usage Invoice INV-OA-771

Included calls: 1,000,000
Actual: 1,327,400
Overage due: $327.40 USD
Due date: 31 July 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Orbit Analytics",
      amount: 327.4,
      currency: "USD",
      dueDate: "2026-07-31",
      notes: "SaaS usage overage invoice",
    },
  },
  {
    email: {
      id: "eval-41",
      threadId: "eval-thread-41",
      subject: "Equipment lease invoice — month 14 of 36",
      from: "leasing@ironclad-finance.example",
      date: d(11, 7, 2026, 7, 55),
      snippet: "Lease payment $1,105 due July 20",
      bodyText: `
Ironclad Equipment Finance — Lease Invoice LE-4414-14

Asset: CNC mill #A-19
Monthly lease installment due: $1,105.00 USD
Due date: 20 July 2026
Remaining term: 22 months
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Ironclad Equipment Finance",
      amount: 1105,
      currency: "USD",
      dueDate: "2026-07-20",
      notes: "Equipment lease installment invoice",
    },
  },
  {
    email: {
      id: "eval-42",
      threadId: "eval-thread-42",
      subject: "Catering invoice — offsite dinner 28 June",
      from: "accounts@plateandstem.example",
      date: d(12, 7, 2026, 18, 0),
      snippet: "Event catering £1,640 due Net 7",
      bodyText: `
Plate & Stem Catering — INVOICE PS-2281

Event: Team offsite dinner (42 guests)
Amount due: £1,640.00 GBP
Due date: 19 July 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Plate & Stem Catering",
      amount: 1640,
      currency: "GBP",
      dueDate: "2026-07-19",
      notes: "Event catering invoice",
    },
  },
  {
    email: {
      id: "eval-43",
      threadId: "eval-thread-43",
      subject: "Translation invoice — EN→DE product docs",
      from: "billing@wortwerk.example",
      date: d(13, 7, 2026, 9, 9),
      snippet: "Wortwerk invoice WW-910 €760",
      bodyText: `
Wortwerk Übersetzungen — Rechnung WW-910

Leistung: EN→DE Produktdokumentation (12,000 Wörter)
Rechnungsbetrag: 760,00 €
Fällig am: 27.07.2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Wortwerk",
      amount: 760,
      currency: "EUR",
      dueDate: "2026-07-27",
      notes: "German-language translation invoice",
    },
  },
  {
    email: {
      id: "eval-44",
      threadId: "eval-thread-44",
      subject: "Security deposit request — studio sublease",
      from: "landlord@eastyard.example",
      date: d(14, 7, 2026, 20, 20),
      snippet: "Deposit $3,000 before keys",
      bodyText: `
East Yard Studios

Before key handover for the short sublease, please transfer the security deposit:
Amount: $3,000.00 USD
Due: before 18 July 2026

This is a refundable deposit, not rent. Still an amount you must pay to proceed.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "East Yard Studios",
      amount: 3000,
      currency: "USD",
      dueDate: "2026-07-18",
      notes: "Security deposit demand — payable to proceed (edge case)",
    },
  },
  {
    email: {
      id: "eval-45",
      threadId: "eval-thread-45",
      subject: "JetBrains license renewal invoice",
      from: "sales@jetbrains.com",
      date: d(15, 7, 2026, 11, 35),
      snippet: "All Products Pack $249 due July 29",
      bodyText: `
JetBrains — Invoice JB-2026-77120

Product: All Products Pack (annual)
Amount due: $249.00 USD
Due date: 29 July 2026
License continues only after payment.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "JetBrains",
      amount: 249,
      currency: "USD",
      dueDate: "2026-07-29",
      notes: "Software license renewal invoice",
    },
  },
  {
    email: {
      id: "eval-46",
      threadId: "eval-thread-46",
      subject: "Invoice payable in USDC — INV-CRYPTO-09",
      from: "billing@chainledger.example",
      date: d(16, 7, 2026, 3, 3),
      snippet: "Pay 1,250 USDC by 30 July",
      bodyText: `
ChainLedger — INVOICE INV-CRYPTO-09

Services: On-chain analytics retainer
Amount due: 1,250 USDC (≈ $1,250.00 USD)
Wallet: 0xDEMO00000000000000000000000000000000
Due date: 30 July 2026

Stablecoin payment accepted; USD equivalent shown for accounting.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "ChainLedger",
      amount: 1250,
      currency: "USD",
      dueDate: "2026-07-30",
      notes: "Crypto-payable invoice with USD equivalent",
    },
  },
  {
    email: {
      id: "eval-47",
      threadId: "eval-thread-47",
      subject: "Split billing — your 40% share of loft utilities",
      from: "roomie@flatshare.example",
      date: d(17, 7, 2026, 22, 10),
      snippet: "Your share $94.80 of July utilities",
      bodyText: `
Hey — July utilities totaled $237.00.
Your agreed 40% share: $94.80 USD
Please Venmo me by July 25.

Not a company vendor invoice — personal cost share.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Personal roommate split — not business payable invoice",
    },
  },
  {
    email: {
      id: "eval-48",
      threadId: "eval-thread-48",
      subject: "Can you send the £300 when you can?",
      from: "friend@personal.example",
      date: d(18, 7, 2026, 21, 0),
      snippet: "No rush on the concert tickets",
      bodyText: `
Hey! Whenever you get a chance, could you send the £300 for the concert tickets I fronted?
No invoice, no due date — just whenever works.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Informal personal IOU — not an accounting invoice",
    },
  },
  {
    email: {
      id: "eval-49",
      threadId: "eval-thread-49",
      subject: "FX invoice — billed in EUR, pay USD equivalent",
      from: "ar@alpine-optics.example",
      date: d(19, 7, 2026, 8, 30),
      snippet: "EUR 2,000 due; USD spot guidance $2,180",
      bodyText: `
Alpine Optics GmbH — INVOICE AO-5560

Optical assemblies shipment
Amount due: EUR 2,000.00
Due date: 2 August 2026

If paying from a USD account, use the spot rate on payment day
(indicative today: ≈ $2,180.00 USD). The contractual currency is EUR.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Alpine Optics",
      amount: 2000,
      currency: "EUR",
      dueDate: "2026-08-02",
      notes: "Multi-currency guidance — contractual amount is EUR",
    },
  },
  {
    email: {
      id: "eval-50",
      threadId: "eval-thread-50",
      subject: "Maybe invoice? packing list + totals for warehouse",
      from: "warehouse@mixedsignals.example",
      date: d(20, 7, 2026, 14, 55),
      snippet: "Totals mentioned but unclear if payable",
      bodyText: `
Packing list PL-908

Items shipped today.
Line totals for internal tracking: $4,400 inventory value.

Please confirm receipt. Payment terms are on a separate invoice if/when issued.
This message is a packing list only.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Ambiguous packing list with money-like totals — not payable",
    },
  },
];

export const EVAL_EMAILS_50: RawEmail[] = EVAL_SCENARIOS_50.map((s) => s.email);

if (EVAL_SCENARIOS_50.length !== 50) {
  throw new Error(
    `EVAL_SCENARIOS_50 must contain exactly 50 scenarios, found ${EVAL_SCENARIOS_50.length}`,
  );
}
