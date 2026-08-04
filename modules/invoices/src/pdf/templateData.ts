import type { Invoice, InvoiceBlock } from "../schema/types.js";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);
}

function blockText(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

function lineItemAmounts(content: Record<string, unknown>): {
  quantity: number;
  unitPrice: number;
  total: number;
} {
  const quantity = Number(content.amount ?? 0);
  const unitPrice = Number(content.cost_per_item ?? 0);
  return { quantity, unitPrice, total: quantity * unitPrice };
}

/**
 * Renders block content to a plain-text positions body.
 *
 * The invoice PDF already renders through the xml_liquid pdf-templates provider
 * (see generate.ts) — what is still interim is this *body*: offers builds a
 * structured `items[]` array that the template lays out as a real table
 * (offerToTemplateData + template-parts.ts), while invoices flattens every
 * position into one text blob. Porting that is a template change that alters
 * every rendered invoice, so it is tracked separately, not folded in here.
 */
export function renderBlocksToText(blocks: InvoiceBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const content = block.content_json ?? {};
    switch (block.type) {
      case "phase":
      case "headline":
        lines.push(blockText(content, "title").toUpperCase());
        break;
      case "subheading":
        lines.push(blockText(content, "title"));
        break;
      case "text":
        lines.push(blockText(content, "content"));
        break;
      case "line_item": {
        const { quantity, unitPrice, total } = lineItemAmounts(content);
        const title =
          blockText(content, "title") || blockText(content, "content");
        lines.push(
          `${title}  —  ${quantity} × ${formatNumber(unitPrice)} = ${formatNumber(total)}`
        );
        break;
      }
      default:
        break;
    }
  }
  return lines.filter((l) => l.trim().length > 0).join("\n");
}

export function toInvoiceTemplateData(
  invoice: Invoice,
  blocks: InvoiceBlock[] = []
): Record<string, unknown> {
  const recipient = invoice.recipientSnapshot;
  const positions = blocks.length > 0 ? renderBlocksToText(blocks) : "";
  const body = positions || invoice.content || "";

  return {
    invoice: {
      number: invoice.number,
      date: invoice.date,
      dueDate: invoice.dueDate,
      content: body,
      body,
      title: invoice.title ?? "",
      introduction: invoice.introduction ?? "",
      finalNotes: invoice.finalNotes ?? "",
      sumNettoFormatted: formatNumber(invoice.sumNetto),
      taxFormatted: formatNumber(invoice.tax),
      sumBruttoFormatted: formatNumber(invoice.sumBrutto),
      recipientName: recipient?.displayName ?? invoice.recipientName ?? "",
      recipientStreet: recipient?.address.street ?? "",
      recipientPostalCode: recipient?.address.postalCode ?? "",
      recipientCity: recipient?.address.city ?? "",
      recipientCountry: recipient?.address.country ?? "",
      recipientEmail: recipient?.email ?? invoice.recipientEmail ?? "",
      recipientTaxId: recipient?.taxId ?? "",
      recipientVatId: recipient?.vatId ?? "",
    },
    theme: {
      textColor: "#111827",
      accentColor: "#1D4ED8",
      mutedColor: "#6B7280",
    },
  };
}
