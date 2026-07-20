import type { RawEmail } from "@/lib/gmail";

type Currency = "USD" | "GBP" | "EUR";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
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
] as const;

const INVOICE_VENDORS = [
  { name: "Northwind Supplies", from: "billing@northwind.example", domain: "northwind" },
  { name: "Amazon Web Services", from: "no-reply@amazon.com", domain: "aws" },
  { name: "Cloudhost Ltd", from: "accounts@cloudhost.example", domain: "cloudhost" },
  { name: "Stripe, Inc.", from: "invoices@stripe.com", domain: "stripe" },
  { name: "Spotify for Business", from: "billing@spotify.com", domain: "spotify" },
  { name: "Harcourt & Co", from: "accounts@harcourt-legal.example", domain: "harcourt" },
  { name: "Slack Technologies", from: "billing@slack.com", domain: "slack" },
  { name: "Maya Chen Studio", from: "maya@studio.example", domain: "maya" },
  { name: "GitHub, Inc.", from: "billing@github.com", domain: "github" },
  { name: "Apex Advisory", from: "billing@apex-advisory.example", domain: "apex" },
  { name: "Acme SaaS", from: "billing@acme-saas.example", domain: "acme" },
  { name: "Brightline Telecom", from: "invoices@brightline.example", domain: "brightline" },
  { name: "ParcelOps Logistics", from: "accounts@parcelops.example", domain: "parcelops" },
  { name: "Nova Design Co", from: "finance@novadesign.example", domain: "nova" },
  { name: "Orbit Analytics", from: "billing@orbit-analytics.example", domain: "orbit" },
] as const;

const RECEIPT_VENDORS = [
  { name: "Figma", from: "receipts@figma.com" },
  { name: "Adobe", from: "noreply@adobe.com" },
  { name: "Uber", from: "receipts@uber.com" },
  { name: "Northern Power", from: "receipts@northernpower.example" },
  { name: "Notion", from: "receipts@notion.so" },
  { name: "Dropbox", from: "noreply@dropbox.com" },
  { name: "Zoom", from: "receipts@zoom.us" },
] as const;

const PEOPLE = [
  "alex@company.example",
  "sam@friends.example",
  "jordan@company.example",
  "chris@personal.example",
  "taylor@company.example",
  "riley@friends.example",
] as const;

const NEWSLETTERS = [
  "Product Weekly <digest@newsletter.example>",
  "Growth Tips <hello@growthlab.example>",
  "Dev Digest <news@devdigest.example>",
  "Office Perks <offers@officeperks.example>",
] as const;

const SHIPPERS = [
  "ShopFast Shipping <ship@shopfast.example>",
  "QuickCart Fulfillment <ship@quickcart.example>",
  "ParcelTrack <updates@parceltrack.example>",
] as const;

const formatRfcDate = (dayOffset: number) => {
  // Spread across early–mid July 2026 for stable demo dates.
  const date = new Date(Date.UTC(2026, 6, 1 + (dayOffset % 20), 8 + (dayOffset % 10), (dayOffset * 7) % 60));
  const weekday = WEEKDAYS[date.getUTCDay()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${weekday}, ${day} ${month} ${year} ${hh}:${mm}:00 +0000`;
};

const formatDueDate = (dayOffset: number, currency: Currency) => {
  const date = new Date(Date.UTC(2026, 6, 15 + (dayOffset % 25)));
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  if (currency === "EUR") {
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
  if (currency === "GBP") {
    return `${day} July ${year}`;
  }
  return `July ${day}, ${year}`;
};

const money = (value: number, currency: Currency) => {
  const rounded = Math.round(value * 100) / 100;
  if (currency === "GBP") return `£${rounded.toFixed(2)}`;
  if (currency === "EUR") return `€${rounded.toFixed(2)}`;
  return `$${rounded.toFixed(2)}`;
};

const pick = <T,>(items: readonly T[], index: number) => items[index % items.length];

const makeInvoice = (index: number): RawEmail => {
  const vendor = pick(INVOICE_VENDORS, index);
  const currency = pick(["USD", "GBP", "EUR"] as const, index);
  const amount = 40 + ((index * 37) % 4900) + (index % 100) / 100;
  const invoiceNumber = `${vendor.domain.toUpperCase().slice(0, 3)}-${1000 + index}`;
  const due = formatDueDate(index, currency);
  const withAttachment = index % 5 === 0;

  const bodyText = `
${vendor.name}

INVOICE ${invoiceNumber}
Bill To: Ledgerline Demo

Amount due: ${money(amount, currency)} ${currency === "USD" ? "USD" : currency}
Due date: ${due}

Please remit payment by the due date to avoid service interruption.
`.trim();

  return {
    id: `gen-${index + 1}`,
    threadId: `gen-thread-${index + 1}`,
    subject: `Invoice ${invoiceNumber} from ${vendor.name}`,
    from: `${vendor.name} <${vendor.from}>`,
    date: formatRfcDate(index),
    snippet: `Invoice ${invoiceNumber} — ${money(amount, currency)} due ${due}`,
    bodyText: withAttachment
      ? `Hello,\n\nPlease see the attached invoice ${invoiceNumber}.\n\nRegards,\n${vendor.name} Billing\n`
      : bodyText,
    attachmentTexts: withAttachment
      ? [
          `${vendor.name}\nTAX INVOICE ${invoiceNumber}\nTotal amount due: ${money(amount, currency)} ${currency}\nDue date: ${due}\n`,
        ]
      : [],
  };
};

const makeReceipt = (index: number): RawEmail => {
  const vendor = pick(RECEIPT_VENDORS, index);
  const amount = 8 + ((index * 13) % 120) + (index % 10) / 10;
  return {
    id: `gen-${index + 1}`,
    threadId: `gen-thread-${index + 1}`,
    subject: `Receipt for your ${vendor.name} payment`,
    from: `${vendor.name} <${vendor.from}>`,
    date: formatRfcDate(index),
    snippet: `You paid ${money(amount, "USD")} — payment received.`,
    bodyText: `
${vendor.name} Receipt

Amount paid: ${money(amount, "USD")}
Payment date: July ${(index % 20) + 1}, 2026
Status: Paid in full

This is not a bill. No further action needed.
`.trim(),
    attachmentTexts: [],
  };
};

const makePersonal = (index: number): RawEmail => {
  const from = pick(PEOPLE, index);
  const topics = [
    ["Team lunch next week?", "Want to grab lunch with the team next week? No rush either way."],
    ["Birthday dinner plans?", "Are you free for birthday dinner? Thinking Italian — no invoices here."],
    ["Coffee catch-up tomorrow?", "Free at 10am tomorrow for a quick coffee? Just catch up."],
    ["Weekend hiking photos", "Here are a few shots from the trail. Hope you had a good one!"],
    ["Docs review ping", "Can you skim the draft proposal when you get a chance? No payment involved."],
    ["Office move reminders", "Reminder: bring your badge on Friday. Facilities handles the rest."],
  ] as const;
  const [subject, body] = pick(topics, index);
  return {
    id: `gen-${index + 1}`,
    threadId: `gen-thread-${index + 1}`,
    subject,
    from,
    date: formatRfcDate(index),
    snippet: body.slice(0, 80),
    bodyText: body,
    attachmentTexts: [],
  };
};

const makeNewsletter = (index: number): RawEmail => {
  const from = pick(NEWSLETTERS, index);
  return {
    id: `gen-${index + 1}`,
    threadId: `gen-thread-${index + 1}`,
    subject: `This week’s digest #${index + 1}`,
    from,
    date: formatRfcDate(index),
    snippet: "Five launches worth knowing about",
    bodyText: `
Weekly Digest

1. Product polish
2. Faster exports
3. New shortcuts
4. Customer stories
5. Hiring update

Unsubscribe anytime. This is a marketing newsletter, not a bill.
`.trim(),
    attachmentTexts: [],
  };
};

const makeShipping = (index: number): RawEmail => {
  const from = pick(SHIPPERS, index);
  const tracking = `TRK-${900000 + index}`;
  return {
    id: `gen-${index + 1}`,
    threadId: `gen-thread-${index + 1}`,
    subject: `Your package has shipped — ${tracking}`,
    from,
    date: formatRfcDate(index),
    snippet: `Tracking number ${tracking}`,
    bodyText: `
Good news — your order shipped.

Tracking: ${tracking}
Estimated delivery: July ${(index % 15) + 10}, 2026

No payment is due. This is a shipping notice only.
`.trim(),
    attachmentTexts: [],
  };
};

/**
 * Deterministic corpus of `count` triage emails.
 * Rough mix: ~45% payable invoices, ~55% non-invoices (receipts / personal / newsletters / shipping).
 */
export const generateDemoEmails = (count = 250): RawEmail[] => {
  if (count < 1) throw new Error("count must be >= 1");

  const emails: RawEmail[] = [];
  for (let i = 0; i < count; i += 1) {
    const bucket = i % 20;
    // 9/20 invoices (~45%), rest noise — mirrors the original 20-email mix.
    if (bucket < 9) {
      emails.push(makeInvoice(i));
    } else if (bucket < 13) {
      emails.push(makeReceipt(i));
    } else if (bucket < 16) {
      emails.push(makePersonal(i));
    } else if (bucket < 18) {
      emails.push(makeNewsletter(i));
    } else {
      emails.push(makeShipping(i));
    }
  }
  return emails;
};

export const GENERATED_DEMO_EMAILS_250 = generateDemoEmails(250);
