import type { RawEmail } from "@/lib/gmail";
import type { EvalScenario } from "@/lib/eval-emails";

const d = (
  day: number,
  month = 8,
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
 * Second handcrafted eval batch (evalb-*) — unique scenarios not in EVAL_SCENARIOS_50.
 */
export const EVAL_SCENARIOS_B_50: EvalScenario[] = [
  {
    email: {
      id: "evalb-1",
      threadId: "evalb-thread-1",
      subject: "Demurrage invoice — Container MSKU7782120",
      from: "billing@harborline-terminals.example",
      date: d(1, 8, 2026, 6, 20),
      snippet: "Demurrage $1,860 due Aug 12",
      bodyText: `
Harborline Terminals — DEMURRAGE INVOICE HT-D-4412

Container: MSKU7782120
Free time ended: 28 July 2026
Demurrage days: 6 @ $310
Amount due: $1,860.00 USD
Due date: 12 August 2026

Pay before gate-out will be blocked.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Harborline Terminals",
      amount: 1860,
      currency: "USD",
      dueDate: "2026-08-12",
      notes: "Shipping demurrage invoice",
    },
  },
  {
    email: {
      id: "evalb-2",
      threadId: "evalb-thread-2",
      subject: "NDA draft for review — no fees",
      from: "legal@partnerco.example",
      date: d(2, 8, 2026, 11, 0),
      snippet: "Attached NDA for signature",
      bodyText: `
Please review the attached mutual NDA.
No payment is requested. Signature only.
`.trim(),
      attachmentTexts: ["MUTUAL NDA — draft for signature. No fees."],
    },
    expected: {
      isInvoice: false,
      notes: "Legal NDA — not a bill",
    },
  },
  {
    email: {
      id: "evalb-3",
      threadId: "evalb-thread-3",
      subject: "Recurring payroll tax deposit confirmation",
      from: "noreply@adp.example",
      date: d(3, 8, 2026, 5, 5),
      snippet: "Federal tax deposit $4,212.18 submitted",
      bodyText: `
ADP Tax Filing Confirmation

We submitted your federal payroll tax deposit of $4,212.18 USD.
Confirmation #: TX-991028
Date: 3 August 2026

This confirms a completed remittance — not a vendor invoice to pay again.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Payroll tax deposit confirmation — already remitted",
    },
  },
  {
    email: {
      id: "evalb-4",
      threadId: "evalb-thread-4",
      subject: "Snow removal invoice — storm Janine",
      from: "accounts@northclear-plow.example",
      date: d(4, 8, 2026, 8, 40),
      snippet: "Lot clearing £640 due 18 Aug",
      bodyText: `
Northclear Plow Ltd — INVOICE NC-882

Service: Emergency lot clearing (Storm Janine)
Site: Canal Wharf Unit 12
Amount due: £640.00 GBP
Due date: 18 August 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Northclear Plow",
      amount: 640,
      currency: "GBP",
      dueDate: "2026-08-18",
      notes: "Facilities / snow removal invoice",
    },
  },
  {
    email: {
      id: "evalb-5",
      threadId: "evalb-thread-5",
      subject: "Calendar invite: Q3 planning offsite",
      from: "calendar-notification@company.example",
      date: d(5, 8, 2026, 9, 0),
      snippet: "You are invited — Sep 12",
      bodyText: `
Event: Q3 planning offsite
When: 12 September 2026, 09:00–17:00
Location: Riverside Lodge

This is a calendar invitation. No payment due.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Calendar invite — not financial",
    },
  },
  {
    email: {
      id: "evalb-6",
      threadId: "evalb-thread-6",
      subject: "VAT reverse-charge invoice — EU consulting",
      from: "billing@berlin-strategy.example",
      date: d(6, 8, 2026, 10, 15),
      snippet: "Net €3,400 — reverse charge applies",
      bodyText: `
Berlin Strategy UG — INVOICE BS-2201

Consulting sprint (remote)
Net amount: EUR 3,400.00
VAT: Reverse charge — customer accounts for VAT
Amount payable to supplier: EUR 3,400.00
Due date: 20 August 2026

Article 196 reverse charge noted on invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Berlin Strategy",
      amount: 3400,
      currency: "EUR",
      dueDate: "2026-08-20",
      notes: "EU reverse-charge invoice — still payable net",
    },
  },
  {
    email: {
      id: "evalb-7",
      threadId: "evalb-thread-7",
      subject: "Your domain expiring soon — renew optional",
      from: "reminders@namecheap.example",
      date: d(7, 8, 2026, 12, 0),
      snippet: "ledgerline.example expires Sep 1",
      bodyText: `
Domain renewal reminder

ledgerline.example expires 1 September 2026.
Renewal price if you choose to renew: $14.98/year

No invoice has been created. Renew in the control panel if desired.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Optional renewal reminder — not billed yet",
    },
  },
  {
    email: {
      id: "evalb-8",
      threadId: "evalb-thread-8",
      subject: "Pest control service invoice PC-440",
      from: "billing@critterclear.example",
      date: d(8, 8, 2026, 14, 30),
      snippet: "Quarterly service $189 due Aug 22",
      bodyText: `
CritterClear — INVOICE PC-440

Quarterly commercial pest service
Amount due: $189.00 USD
Due date: 22 August 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "CritterClear",
      amount: 189,
      currency: "USD",
      dueDate: "2026-08-22",
      notes: "Pest control service invoice",
    },
  },
  {
    email: {
      id: "evalb-9",
      threadId: "evalb-thread-9",
      subject: "Slack connect channel request",
      from: "notifications@slack.com",
      date: d(9, 8, 2026, 7, 45),
      snippet: "Acme wants to connect #shared-ops",
      bodyText: `
Acme Corp requested a Slack Connect channel with your workspace.
Approve or decline in Slack. No billing in this message.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Product notification — not billing",
    },
  },
  {
    email: {
      id: "evalb-10",
      threadId: "evalb-thread-10",
      subject: "Photography day rate invoice — product shoot",
      from: "studio@lensandgrain.example",
      date: d(10, 8, 2026, 16, 10),
      snippet: "Invoice LG-901 £1,100",
      bodyText: `
Lens & Grain Studio — INVOICE LG-901

Product shoot day rate + retouching
Amount due: £1,100.00 GBP
Due date: 24 August 2026
Usage: web + social (12 months)
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Lens & Grain Studio",
      amount: 1100,
      currency: "GBP",
      dueDate: "2026-08-24",
      notes: "Creative photography invoice",
    },
  },
  {
    email: {
      id: "evalb-11",
      threadId: "evalb-thread-11",
      subject: "Stock grant notice — 500 RSUs vested",
      from: "equity@carta.example",
      date: d(11, 8, 2026, 13, 20),
      snippet: "Vesting event — tax withholding may apply",
      bodyText: `
Carta — Equity Notice

500 RSUs vested on 11 August 2026.
Estimated tax withholding will be handled via payroll.

This is not a vendor invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Equity vesting notice — not AP invoice",
    },
  },
  {
    email: {
      id: "evalb-12",
      threadId: "evalb-thread-12",
      subject: "Waste collection invoice — Aug lift",
      from: "ar@urbancycle.example",
      date: d(12, 8, 2026, 8, 5),
      snippet: "Bin lift €96 due 28 Aug",
      bodyText: `
UrbanCycle — FACTUUR UC-3381

Handelsafval ophaal — augustus
Te betalen: €96,00
Vervaldatum: 28 augustus 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "UrbanCycle",
      amount: 96,
      currency: "EUR",
      dueDate: "2026-08-28",
      notes: "Dutch waste collection invoice",
    },
  },
  {
    email: {
      id: "evalb-13",
      threadId: "evalb-thread-13",
      subject: "Background check completed — candidate #8821",
      from: "results@checkr.example",
      date: d(13, 8, 2026, 11, 40),
      snippet: "Report ready to view",
      bodyText: `
Your background check order for candidate #8821 is complete.
View the report in the dashboard.

Billing for this order appears on your monthly Checkr statement separately.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Service completion notice — bill comes later",
    },
  },
  {
    email: {
      id: "evalb-14",
      threadId: "evalb-thread-14",
      subject: "Monthly Checkr invoice — July usage",
      from: "billing@checkr.example",
      date: d(14, 8, 2026, 9, 10),
      snippet: "Invoice CHK-2026-07 $428.50",
      bodyText: `
Checkr — INVOICE CHK-2026-07

Background checks completed in July: 14
Amount due: $428.50 USD
Due date: 28 August 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Checkr",
      amount: 428.5,
      currency: "USD",
      dueDate: "2026-08-28",
      notes: "HR screening vendor invoice",
    },
  },
  {
    email: {
      id: "evalb-15",
      threadId: "evalb-thread-15",
      subject: "Fire extinguisher inspection invoice",
      from: "billing@safeguard-fire.example",
      date: d(15, 8, 2026, 7, 30),
      snippet: "Annual inspection $310 due Sep 1",
      bodyText: `
SafeGuard Fire — INVOICE SF-220

Annual extinguisher inspection + tags
Amount due: $310.00 USD
Due date: 1 September 2026
Certificate attached for compliance file.
`.trim(),
      attachmentTexts: ["Certificate of inspection — Site Canal Wharf"],
    },
    expected: {
      isInvoice: true,
      vendor: "SafeGuard Fire",
      amount: 310,
      currency: "USD",
      dueDate: "2026-09-01",
      notes: "Safety compliance service invoice",
    },
  },
  {
    email: {
      id: "evalb-16",
      threadId: "evalb-thread-16",
      subject: "Password reset for your account",
      from: "security@github.com",
      date: d(16, 8, 2026, 3, 3),
      snippet: "Reset link expires in 1 hour",
      bodyText: `
We received a password reset request.
If this wasn't you, ignore this email.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Auth/security email",
    },
  },
  {
    email: {
      id: "evalb-17",
      threadId: "evalb-thread-17",
      subject: "Drone survey invoice — roof scan",
      from: "accounts@skyline-uav.example",
      date: d(17, 8, 2026, 15, 45),
      snippet: "UAV survey £875 due Aug 31",
      bodyText: `
Skyline UAV — INVOICE SU-551

Roof thermography + orthomosaic
Amount due: £875.00 GBP
Due date: 31 August 2026
Deliverables link in portal after payment.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Skyline UAV",
      amount: 875,
      currency: "GBP",
      dueDate: "2026-08-31",
      notes: "Drone survey services invoice",
    },
  },
  {
    email: {
      id: "evalb-18",
      threadId: "evalb-thread-18",
      subject: "Marketing proof approval needed",
      from: "studio@brandshop.example",
      date: d(18, 8, 2026, 12, 12),
      snippet: "Approve v3 banner before print",
      bodyText: `
Please approve creative v3 so we can send to print.
No invoice in this thread — billing was on PO-220.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Creative approval thread — not billing",
    },
  },
  {
    email: {
      id: "evalb-19",
      threadId: "evalb-thread-19",
      subject: "Print invoice after approval — Banner run",
      from: "ar@brandshop.example",
      date: d(19, 8, 2026, 10, 0),
      snippet: "Invoice BS-778 $1,240",
      bodyText: `
BrandShop — INVOICE BS-778

Banner print run (approved v3)
Amount due: $1,240.00 USD
Due date: 2 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "BrandShop",
      amount: 1240,
      currency: "USD",
      dueDate: "2026-09-02",
      notes: "Print production invoice post-approval",
    },
  },
  {
    email: {
      id: "evalb-20",
      threadId: "evalb-thread-20",
      subject: "ISO audit Stage 2 fee invoice",
      from: "finance@certis-audit.example",
      date: d(20, 8, 2026, 9, 25),
      snippet: "Audit fee €4,800 due Sep 5",
      bodyText: `
Certis Audit — INVOICE CA-902

ISO 27001 Stage 2 certification audit
Fee due: EUR 4,800.00
Due date: 5 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Certis Audit",
      amount: 4800,
      currency: "EUR",
      dueDate: "2026-09-05",
      notes: "Certification audit fee invoice",
    },
  },
  {
    email: {
      id: "evalb-21",
      threadId: "evalb-thread-21",
      subject: "Parking garage monthly invoice — Stall 14",
      from: "billing@citypark.example",
      date: d(21, 8, 2026, 6, 50),
      snippet: "August parking $220 due Sep 1",
      bodyText: `
CityPark — INVOICE CP-814

Reserved stall #14 — August 2026
Amount due: $220.00 USD
Due date: 1 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "CityPark",
      amount: 220,
      currency: "USD",
      dueDate: "2026-09-01",
      notes: "Parking subscription invoice",
    },
  },
  {
    email: {
      id: "evalb-22",
      threadId: "evalb-thread-22",
      subject: "Welcome to Linear — getting started",
      from: "hello@linear.app",
      date: d(22, 8, 2026, 14, 0),
      snippet: "Tips to set up your workspace",
      bodyText: `
Welcome aboard! Here are three tips to configure Linear.
Your trial includes billing details later if you upgrade.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Onboarding / marketing welcome",
    },
  },
  {
    email: {
      id: "evalb-23",
      threadId: "evalb-thread-23",
      subject: "Interpreter invoice — board meeting EN/JA",
      from: "billing@polyglot-live.example",
      date: d(23, 8, 2026, 18, 30),
      snippet: "Simultaneous interpreting ¥185,000",
      bodyText: `
Polyglot Live — INVOICE PL-4408

Simultaneous interpreting EN↔JA (3 hours)
Amount due: JPY 185,000
Due date: 6 September 2026
Approx USD equivalent shown in portal for reference only.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Polyglot Live",
      amount: 185000,
      currency: "JPY",
      dueDate: "2026-09-06",
      notes: "JPY interpreting services invoice",
    },
  },
  {
    email: {
      id: "evalb-24",
      threadId: "evalb-thread-24",
      subject: "Server room humidity alert",
      from: "alerts@datacenter-monitor.example",
      date: d(24, 8, 2026, 2, 15),
      snippet: "Humidity > 70% on rack A3",
      bodyText: `
ALERT: Humidity exceeded threshold on rack A3.
Acknowledge in the monitoring console.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Ops alert — not billing",
    },
  },
  {
    email: {
      id: "evalb-25",
      threadId: "evalb-thread-25",
      subject: "Colocation power overage invoice",
      from: "billing@rackspace-metro.example",
      date: d(25, 8, 2026, 8, 8),
      snippet: "Power overage $612.40 due Sep 8",
      bodyText: `
Metro Colocation — INVOICE MC-7712

Committed power: 4.0 kW
Peak measured: 5.2 kW
Overage charges due: $612.40 USD
Due date: 8 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Metro Colocation",
      amount: 612.4,
      currency: "USD",
      dueDate: "2026-09-08",
      notes: "Datacenter power overage invoice",
    },
  },
  {
    email: {
      id: "evalb-26",
      threadId: "evalb-thread-26",
      subject: "Team lunch receipt split — already paid by Alex",
      from: "alex@company.example",
      date: d(26, 8, 2026, 20, 40),
      snippet: "I paid $186 — ignore for AP",
      bodyText: `
I covered lunch on my personal card ($186). Expense report incoming.
Do not treat this as a vendor bill.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Internal note about personal card spend",
    },
  },
  {
    email: {
      id: "evalb-27",
      threadId: "evalb-thread-27",
      subject: "Florist invoice — office reception arrangement",
      from: "accounts@petalstreet.example",
      date: d(27, 8, 2026, 11, 11),
      snippet: "Weekly flowers £95 due Sep 3",
      bodyText: `
Petal Street — INVOICE PS-1204

Reception arrangement (week of 25 Aug)
Amount due: £95.00 GBP
Due date: 3 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Petal Street",
      amount: 95,
      currency: "GBP",
      dueDate: "2026-09-03",
      notes: "Office florist invoice",
    },
  },
  {
    email: {
      id: "evalb-28",
      threadId: "evalb-thread-28",
      subject: "RFP response submitted — RFP-2026-44",
      from: "bids@supplyco.example",
      date: d(28, 8, 2026, 13, 0),
      snippet: "Bid package uploaded",
      bodyText: `
We submitted our bid for RFP-2026-44.
Proposed price schedule is for evaluation only until award.
No invoice issued.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "RFP bid submission — not an invoice",
    },
  },
  {
    email: {
      id: "evalb-29",
      threadId: "evalb-thread-29",
      subject: "Awarded PO + first milestone invoice",
      from: "ar@supplyco.example",
      date: d(29, 8, 2026, 9, 40),
      snippet: "Milestone 1 invoice $8,500",
      bodyText: `
SupplyCo — INVOICE SC-M1-01

Per awarded PO-55018
Milestone 1: Kickoff + design pack
Amount due: $8,500.00 USD
Due date: 12 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "SupplyCo",
      amount: 8500,
      currency: "USD",
      dueDate: "2026-09-12",
      notes: "Milestone invoice after PO award",
    },
  },
  {
    email: {
      id: "evalb-30",
      threadId: "evalb-thread-30",
      subject: "Carbon offset certificate — purchase confirmation",
      from: "receipts@climatemarket.example",
      date: d(30, 8, 2026, 10, 10),
      snippet: "You purchased 12 tCO2e — paid",
      bodyText: `
ClimateMarket — Purchase Receipt

12 tonnes CO2e offsets
Amount paid: $180.00 USD
Status: Paid in full on 30 August 2026

Receipt only — no further payment due.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Paid carbon offset receipt",
    },
  },
  {
    email: {
      id: "evalb-31",
      threadId: "evalb-thread-31",
      subject: "Carbon offset invoice — unpaid batch",
      from: "billing@climatemarket.example",
      date: d(31, 8, 2026, 10, 20),
      snippet: "Invoice CM-882 $420 due Sep 14",
      bodyText: `
ClimateMarket — INVOICE CM-882

28 tonnes CO2e (corporate program)
Amount due: $420.00 USD
Due date: 14 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "ClimateMarket",
      amount: 420,
      currency: "USD",
      dueDate: "2026-09-14",
      notes: "Unpaid carbon offset invoice",
    },
  },
  {
    email: {
      id: "evalb-32",
      threadId: "evalb-thread-32",
      subject: "Board deck attached — pre-read",
      from: "ceo@ledgerline.example",
      date: d(1, 9, 2026, 7, 0),
      snippet: "Please read before Thursday",
      bodyText: `
Pre-read for Thursday board meeting attached.
No financial asks in this email.
`.trim(),
      attachmentTexts: ["Board deck Q3 — confidential"],
    },
    expected: {
      isInvoice: false,
      notes: "Internal board pre-read",
    },
  },
  {
    email: {
      id: "evalb-33",
      threadId: "evalb-thread-33",
      subject: "Notary invoice — document apostille",
      from: "billing@city-notary.example",
      date: d(2, 9, 2026, 11, 30),
      snippet: "Apostille fee $95 due on collection",
      bodyText: `
City Notary — INVOICE CN-220

Apostille service (2 documents)
Amount due: $95.00 USD
Due: upon collection / by 9 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "City Notary",
      amount: 95,
      currency: "USD",
      dueDate: "2026-09-09",
      notes: "Notary / apostille fee invoice",
    },
  },
  {
    email: {
      id: "evalb-34",
      threadId: "evalb-thread-34",
      subject: "LinkedIn Sales Navigator trial ending",
      from: "linkedin@email.linkedin.example",
      date: d(3, 9, 2026, 12, 0),
      snippet: "Trial ends — subscribe to continue",
      bodyText: `
Your Sales Navigator trial ends in 3 days.
Subscribe to keep access. No invoice until you subscribe.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Trial ending marketing nudge",
    },
  },
  {
    email: {
      id: "evalb-35",
      threadId: "evalb-thread-35",
      subject: "LinkedIn invoice — Sales Navigator annual",
      from: "billing-noreply@linkedin.example",
      date: d(4, 9, 2026, 12, 30),
      snippet: "Invoice LI-99102 $1,599",
      bodyText: `
LinkedIn — INVOICE LI-99102

Sales Navigator Team (annual)
Amount due: $1,599.00 USD
Due date: 18 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "LinkedIn",
      amount: 1599,
      currency: "USD",
      dueDate: "2026-09-18",
      notes: "SaaS annual subscription invoice",
    },
  },
  {
    email: {
      id: "evalb-36",
      threadId: "evalb-thread-36",
      subject: "Lab consumables invoice — reagents",
      from: "orders@helix-lab-supply.example",
      date: d(5, 9, 2026, 8, 45),
      snippet: "Order HL-44021 €2,145 due Sep 19",
      bodyText: `
Helix Lab Supply — INVOICE HL-44021

Reagents + cold-chain shipping
Amount due: EUR 2,145.00
Due date: 19 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Helix Lab Supply",
      amount: 2145,
      currency: "EUR",
      dueDate: "2026-09-19",
      notes: "Lab supplies invoice",
    },
  },
  {
    email: {
      id: "evalb-37",
      threadId: "evalb-thread-37",
      subject: "Cold chain excursion report — shipment HL-44021",
      from: "quality@helix-lab-supply.example",
      date: d(6, 9, 2026, 9, 5),
      snippet: "Temp spike recorded — investigating",
      bodyText: `
Quality notice: temperature excursion on shipment HL-44021.
We are investigating. Credit may follow — no action required yet.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Quality incident notice — possible future credit",
    },
  },
  {
    email: {
      id: "evalb-38",
      threadId: "evalb-thread-38",
      subject: "Window cleaning invoice — facade Q3",
      from: "billing@clearview-facade.example",
      date: d(7, 9, 2026, 7, 20),
      snippet: "Facade clean £480 due Sep 21",
      bodyText: `
Clearview Facade — INVOICE CF-331

Exterior window cleaning (Q3)
Amount due: £480.00 GBP
Due date: 21 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Clearview Facade",
      amount: 480,
      currency: "GBP",
      dueDate: "2026-09-21",
      notes: "Building maintenance invoice",
    },
  },
  {
    email: {
      id: "evalb-39",
      threadId: "evalb-thread-39",
      subject: "GitHub Actions minutes — soft limit warning",
      from: "noreply@github.com",
      date: d(8, 9, 2026, 4, 4),
      snippet: "80% of included minutes used",
      bodyText: `
Your organization has used 80% of included Actions minutes.
Overage billing (if any) appears on the next invoice.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Usage warning — not yet an invoice",
    },
  },
  {
    email: {
      id: "evalb-40",
      threadId: "evalb-thread-40",
      subject: "Locksmith emergency callout invoice",
      from: "accounts@quickkey-lock.example",
      date: d(9, 9, 2026, 22, 50),
      snippet: "After-hours callout $340 due Sep 16",
      bodyText: `
QuickKey Locksmith — INVOICE QK-908

After-hours office lockout + rekey
Amount due: $340.00 USD
Due date: 16 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "QuickKey Locksmith",
      amount: 340,
      currency: "USD",
      dueDate: "2026-09-16",
      notes: "Emergency locksmith invoice",
    },
  },
  {
    email: {
      id: "evalb-41",
      threadId: "evalb-thread-41",
      subject: "Patent annuity reminder — optional pay agent",
      from: "renewals@ip-agent.example",
      date: d(10, 9, 2026, 10, 0),
      snippet: "Annuity due Oct 1 — instruct us to pay?",
      bodyText: `
Patent US10,123,456 annuity is due 1 October 2026.
Official fee ≈ $1,600 plus our agency fee if you instruct us to pay.

Reply to instruct. No invoice until you authorize payment.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "IP annuity reminder awaiting instruction",
    },
  },
  {
    email: {
      id: "evalb-42",
      threadId: "evalb-thread-42",
      subject: "Patent annuity invoice — authorized payment",
      from: "billing@ip-agent.example",
      date: d(11, 9, 2026, 10, 30),
      snippet: "Invoice IP-ANN-44 $1,850",
      bodyText: `
IP Agent LLP — INVOICE IP-ANN-44

US patent annuity + agency fee (authorized)
Amount due: $1,850.00 USD
Due date: 25 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "IP Agent LLP",
      amount: 1850,
      currency: "USD",
      dueDate: "2026-09-25",
      notes: "Authorized IP annuity invoice",
    },
  },
  {
    email: {
      id: "evalb-43",
      threadId: "evalb-thread-43",
      subject: "Coffee machine lease invoice — month 8",
      from: "leasing@beanfinance.example",
      date: d(12, 9, 2026, 6, 15),
      snippet: "Lease installment €89 due Sep 20",
      bodyText: `
Bean Finance — LEASE INVOICE BF-8808

Office espresso system — installment 8/24
Amount due: EUR 89.00
Due date: 20 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Bean Finance",
      amount: 89,
      currency: "EUR",
      dueDate: "2026-09-20",
      notes: "Equipment lease installment (coffee)",
    },
  },
  {
    email: {
      id: "evalb-44",
      threadId: "evalb-thread-44",
      subject: "Survey: how was your support experience?",
      from: "cx@cloudhost.example",
      date: d(13, 9, 2026, 15, 0),
      snippet: "2-minute CSAT survey",
      bodyText: `
Thanks for contacting support. Please rate your experience.
No billing content.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "CSAT survey",
    },
  },
  {
    email: {
      id: "evalb-45",
      threadId: "evalb-thread-45",
      subject: "Moving company invoice — office relocation",
      from: "ar@swiftshift-movers.example",
      date: d(14, 9, 2026, 17, 40),
      snippet: "Relocation SS-221 £3,950 due Sep 28",
      bodyText: `
SwiftShift Movers — INVOICE SS-221

Office move Canal Wharf → Tech Park
Amount due: £3,950.00 GBP
Due date: 28 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "SwiftShift Movers",
      amount: 3950,
      currency: "GBP",
      dueDate: "2026-09-28",
      notes: "Office relocation movers invoice",
    },
  },
  {
    email: {
      id: "evalb-46",
      threadId: "evalb-thread-46",
      subject: "Insurance claim update — Claim CL-90821",
      from: "claims@shieldmutual.example",
      date: d(15, 9, 2026, 11, 20),
      snippet: "Additional photos requested",
      bodyText: `
We need two more photos of the damaged equipment for claim CL-90821.
No payment is requested from you at this time.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Insurance claim info request",
    },
  },
  {
    email: {
      id: "evalb-47",
      threadId: "evalb-thread-47",
      subject: "Temporary staffing invoice — week ending 6 Sep",
      from: "billing@peoplebridge.example",
      date: d(16, 9, 2026, 9, 0),
      snippet: "Temp hours $2,640 due Sep 30",
      bodyText: `
PeopleBridge Staffing — INVOICE PB-6610

Temp warehouse associates — week ending 6 Sep
Hours: 160 @ $16.50
Amount due: $2,640.00 USD
Due date: 30 September 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "PeopleBridge Staffing",
      amount: 2640,
      currency: "USD",
      dueDate: "2026-09-30",
      notes: "Temp staffing weekly invoice",
    },
  },
  {
    email: {
      id: "evalb-48",
      threadId: "evalb-thread-48",
      subject: "Candidate declined offer — FYI",
      from: "recruiting@ledgerline.example",
      date: d(17, 9, 2026, 14, 10),
      snippet: "Alex Rivera declined",
      bodyText: `
Candidate declined our offer. Closing the req.
No vendor charges related to this note.
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: false,
      notes: "Internal recruiting update",
    },
  },
  {
    email: {
      id: "evalb-49",
      threadId: "evalb-thread-49",
      subject: "Executive coaching invoice — September sessions",
      from: "billing@summit-coach.example",
      date: d(18, 9, 2026, 8, 30),
      snippet: "Coaching SC-409 $1,200 due Oct 2",
      bodyText: `
Summit Coach — INVOICE SC-409

4× executive coaching sessions (September)
Amount due: $1,200.00 USD
Due date: 2 October 2026
`.trim(),
      attachmentTexts: [],
    },
    expected: {
      isInvoice: true,
      vendor: "Summit Coach",
      amount: 1200,
      currency: "USD",
      dueDate: "2026-10-02",
      notes: "Executive coaching invoice",
    },
  },
  {
    email: {
      id: "evalb-50",
      threadId: "evalb-thread-50",
      subject: "Manifest / packing slip only — ASN-9088",
      from: "shipping@helix-lab-supply.example",
      date: d(19, 9, 2026, 5, 40),
      snippet: "ASN-9088 shipped — invoice separate",
      bodyText: `
Advanced shipping notice ASN-9088
Contents list for warehouse receiving.

Commercial invoice will follow under a separate email if not already sent.
This ASN is not a request for payment.
`.trim(),
      attachmentTexts: ["ASN-9088 line items for receiving only"],
    },
    expected: {
      isInvoice: false,
      notes: "ASN / packing slip — payment on separate invoice",
    },
  },
];

export const EVAL_EMAILS_B_50: RawEmail[] = EVAL_SCENARIOS_B_50.map(
  (s) => s.email,
);

if (EVAL_SCENARIOS_B_50.length !== 50) {
  throw new Error(
    `EVAL_SCENARIOS_B_50 must contain exactly 50 scenarios, found ${EVAL_SCENARIOS_B_50.length}`,
  );
}
