export type PlaceholderCategory =
  | "recipient"
  | "offer"
  | "invoice"
  | "totals"
  | "sender";

export interface PlaceholderDef {
  category: PlaceholderCategory;
  description?: string;
  key: string;
  label: string;
}

export const OFFER_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "recipient_company_name",
    label: "Company name",
    category: "recipient",
  },
  {
    key: "recipient_contact_name",
    label: "Contact name",
    category: "recipient",
  },
  { key: "recipient_email", label: "Email", category: "recipient" },
  { key: "recipient_phone", label: "Phone", category: "recipient" },
  { key: "recipient_address_street", label: "Street", category: "recipient" },
  { key: "recipient_address_zip", label: "ZIP code", category: "recipient" },
  { key: "recipient_address_city", label: "City", category: "recipient" },
  { key: "recipient_address_country", label: "Country", category: "recipient" },
  {
    key: "recipient_address_full",
    label: "Full address",
    category: "recipient",
  },
  { key: "recipient_vat_id", label: "VAT ID", category: "recipient" },
  { key: "offer_title", label: "Offer title", category: "offer" },
  { key: "offer_offer_number", label: "Offer number", category: "offer" },
  { key: "offer_reference", label: "Reference", category: "offer" },
  { key: "offer_created_at", label: "Created date", category: "offer" },
  { key: "offer_valid_until", label: "Valid until", category: "offer" },
  { key: "totals_subtotal", label: "Net subtotal", category: "totals" },
  {
    key: "totals_subtotal_formatted",
    label: "Net subtotal (formatted)",
    category: "totals",
  },
  { key: "totals_total", label: "Gross total", category: "totals" },
  {
    key: "totals_total_formatted",
    label: "Gross total (formatted)",
    category: "totals",
  },
  {
    key: "totals_taxAmount_formatted",
    label: "Tax amount (formatted)",
    category: "totals",
  },
  { key: "totals_currency", label: "Currency code", category: "totals" },
  { key: "sender_company_name", label: "Company name", category: "sender" },
];

export const INVOICE_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "recipient_company_name",
    label: "Company name",
    category: "recipient",
  },
  {
    key: "recipient_contact_name",
    label: "Contact name",
    category: "recipient",
  },
  { key: "recipient_email", label: "Email", category: "recipient" },
  {
    key: "recipient_address_full",
    label: "Full address",
    category: "recipient",
  },
  {
    key: "invoice_invoice_number",
    label: "Invoice number",
    category: "invoice",
  },
  { key: "invoice_issue_date", label: "Issue date", category: "invoice" },
  { key: "invoice_due_date", label: "Due date", category: "invoice" },
  {
    key: "totals_total_formatted",
    label: "Gross total (formatted)",
    category: "totals",
  },
  { key: "totals_currency", label: "Currency code", category: "totals" },
  { key: "sender_company_name", label: "Company name", category: "sender" },
];

export function getPlaceholdersForDocument(
  documentType: "offer" | "invoice"
): PlaceholderDef[] {
  return documentType === "invoice" ? INVOICE_PLACEHOLDERS : OFFER_PLACEHOLDERS;
}

export const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export interface PlaceholderContext {
  invoice?: Record<string, string | number | null>;
  offer?: Record<string, string | number | null>;
  recipient?: Record<string, string | null>;
  sender?: Record<string, string | null>;
  totals?: Record<string, string | number | null>;
}

export function resolvePlaceholders(
  text: string,
  context: PlaceholderContext
): string {
  if (!text || typeof text !== "string") {
    return text;
  }
  return text.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const underscoreIndex = key.indexOf("_");
    if (underscoreIndex <= 0) {
      return "";
    }
    const category = key.slice(0, underscoreIndex) as keyof PlaceholderContext;
    const field = key.slice(underscoreIndex + 1);
    const categoryData = context[category];
    if (!categoryData || typeof categoryData !== "object") {
      return "";
    }
    const value = (categoryData as Record<string, unknown>)[field];
    return value == null ? "" : String(value);
  });
}

export function buildPlaceholderContext(data: {
  recipient?: Record<string, unknown>;
  offer?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  totals?: Record<string, unknown>;
  sender?: Record<string, unknown>;
}): PlaceholderContext {
  const convert = (value: unknown): string | number | null => {
    if (value == null) {
      return null;
    }
    return typeof value === "number" ? value : String(value);
  };

  return {
    recipient: data.recipient
      ? (Object.fromEntries(
          Object.entries(data.recipient).map(([key, value]) => [
            key,
            convert(value),
          ])
        ) as Record<string, string | null>)
      : undefined,
    offer: data.offer
      ? (Object.fromEntries(
          Object.entries(data.offer).map(([key, value]) => [
            key,
            convert(value),
          ])
        ) as Record<string, string | number | null>)
      : undefined,
    invoice: data.invoice
      ? (Object.fromEntries(
          Object.entries(data.invoice).map(([key, value]) => [
            key,
            convert(value),
          ])
        ) as Record<string, string | number | null>)
      : undefined,
    totals: data.totals
      ? (Object.fromEntries(
          Object.entries(data.totals).map(([key, value]) => [
            key,
            convert(value),
          ])
        ) as Record<string, string | number | null>)
      : undefined,
    sender: data.sender
      ? (Object.fromEntries(
          Object.entries(data.sender).map(([key, value]) => [
            key,
            convert(value),
          ])
        ) as Record<string, string | null>)
      : undefined,
  };
}
