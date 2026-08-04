import {
  type CommercialBlock,
  DEFAULT_LOCALE,
  formatCurrencyPrice,
  formatNumber,
  sanitizeHtml,
  stripHtmlTags,
} from "../../types.js";
import type { CommercialBlock as CoreCommercialBlock } from "../types/blocks.js";
import {
  CommercialBlockTotals,
  type CommercialDocumentType,
} from "./CommercialBlockTotals.js";

/**
 * Chrome-less, read-only HTML rendering of a commercial document (offer /
 * invoice): recipient + meta header, title, introduction, blocks with line
 * items, totals, final notes. The HTML sibling of the PDF template
 * (docs/wip/generative-ui.md §3) — shared so the pane panel, the detail page,
 * and future surfaces render the same document. Layout is single-column and
 * width-tolerant so it works in the narrow side pane.
 */

export interface CommercialDocumentMetaField {
  label: string;
  value: string;
}

export interface CommercialDocumentViewProps {
  blocks: CommercialBlock[];
  className?: string;
  currency?: string;
  defaultTaxRate?: number;
  documentType?: CommercialDocumentType;
  finalNotes?: string | null;
  introduction?: string | null;
  locale?: string;
  meta?: CommercialDocumentMetaField[];
  /** Reason shown when the document carries no tax (e.g. Kleinunternehmer). */
  noTaxReason?: string | null;
  /** Document number, e.g. `AN-2026-014`. */
  number?: string | null;
  phaseIndexPattern?: string;
  /** Recipient address lines, blank lines skipped. */
  recipient?: Array<string | null | undefined>;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
  title?: string | null;
}

type LineItemSubtype = "headline" | "page_break" | "position" | "text";

interface DocumentLineItem {
  description: string;
  quantity: number;
  subtype: LineItemSubtype;
  taxRate: number | null;
  title: string;
  total: number;
  unit: string;
}

function contentString(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

function contentNumber(
  content: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = content[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/** Mirrors the PDF template's `blockToItem` field fallbacks (new + legacy). */
function toLineItem(
  block: CommercialBlock,
  fallbackTaxRate: number
): DocumentLineItem {
  const content = block.content as Record<string, unknown>;
  const quantity = contentNumber(content, ["amount"]) ?? 1;
  const unitPrice = contentNumber(content, ["cost_per_item"]) ?? 0;
  // item_total is only authoritative when set (the editor persists 0 as a
  // placeholder), so fall back to amount × unit price.
  const storedTotal = contentNumber(content, ["item_total"]) ?? 0;
  const rawSubtype = contentString(content, "line_item_subtype");
  const subtype: LineItemSubtype =
    rawSubtype === "headline" ||
    rawSubtype === "text" ||
    rawSubtype === "page_break"
      ? rawSubtype
      : "position";
  return {
    description: stripHtmlTags(contentString(content, "content")).trim(),
    quantity,
    subtype,
    taxRate: contentNumber(content, ["tax"]) ?? fallbackTaxRate,
    title: contentString(content, "title"),
    total: storedTotal || quantity * unitPrice,
    unit: contentString(content, "unit") || "h",
  };
}

function RichText({ className, html }: { className?: string; html: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function LineItemRow({
  currency,
  item,
  locale,
}: {
  currency: string;
  item: DocumentLineItem;
  locale: string;
}) {
  if (item.subtype === "page_break") {
    return null;
  }
  if (item.subtype === "headline") {
    return (
      <div className="pt-3 pb-1 font-semibold text-foreground text-sm">
        {item.title}
      </div>
    );
  }
  const amountless = item.subtype === "text" || item.unit === "text";
  const isFixed = item.unit === "fixed";
  return (
    <div className="flex items-baseline justify-between gap-4 border-border/50 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-sm">{item.title}</div>
        {item.description ? (
          <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground text-xs">
            {item.description}
          </div>
        ) : null}
      </div>
      {amountless ? null : (
        <div className="shrink-0 text-right">
          <div className="font-medium text-foreground text-sm tabular-nums">
            {formatCurrencyPrice(item.total, locale, currency)}
          </div>
          {isFixed ? null : (
            <div className="text-muted-foreground text-xs tabular-nums">
              {`${formatNumber(item.quantity, locale)} ${item.unit} × ${formatCurrencyPrice(
                item.quantity ? item.total / item.quantity : item.total,
                locale,
                currency
              )}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CommercialDocumentView({
  blocks,
  className,
  currency = "EUR",
  defaultTaxRate,
  documentType = "offer",
  finalNotes,
  introduction,
  locale = DEFAULT_LOCALE,
  meta,
  noTaxReason,
  number,
  phaseIndexPattern,
  recipient,
  showPhaseIndex,
  showPhaseTotals,
  showTaxPerItem,
  title,
}: CommercialDocumentViewProps) {
  const ordered = [...blocks].sort((a, b) => a.order_index - b.order_index);
  // Same runtime shape; the two CommercialBlock content unions (package-level
  // vs commercial-core) only differ in their index signatures.
  const totalsBlocks: CoreCommercialBlock[] = ordered.map((block) => ({
    ...block,
    content: block.content as Record<string, unknown>,
  }));
  const fallbackTaxRate = defaultTaxRate ?? 20;
  const recipientLines = (recipient ?? []).filter(
    (line): line is string => typeof line === "string" && line.trim().length > 0
  );
  const metaFields = (meta ?? []).filter((field) => field.value.trim());
  const hasLineItems = ordered.some((block) => block.type === "line_item");

  return (
    <article className={className}>
      {recipientLines.length > 0 || metaFields.length > 0 ? (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="whitespace-pre-line text-foreground/90 text-sm">
            {recipientLines.join("\n")}
          </div>
          {metaFields.length > 0 ? (
            <dl className="space-y-0.5 text-xs">
              {metaFields.map((field) => (
                <div className="flex justify-between gap-4" key={field.label}>
                  <dt className="text-muted-foreground">{field.label}</dt>
                  <dd className="text-foreground/90 tabular-nums">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </header>
      ) : null}

      {number || title ? (
        <div className="mt-6">
          {number ? (
            <div className="text-muted-foreground text-xs">{number}</div>
          ) : null}
          {title ? (
            <h2 className="font-semibold text-foreground text-lg">{title}</h2>
          ) : null}
        </div>
      ) : null}

      {introduction ? (
        <RichText
          className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap text-foreground/90 text-sm"
          html={introduction}
        />
      ) : null}

      <div className="mt-6">
        {ordered.map((block) => {
          const content = block.content as Record<string, unknown>;
          const blockTitle = contentString(content, "title");
          const blockHtml =
            contentString(content, "content") || contentString(content, "text");
          switch (block.type) {
            case "phase":
              return (
                <div className="pt-5 first:pt-0" key={block.id}>
                  <h3 className="border-border border-b pb-1 font-semibold text-base text-foreground">
                    {blockTitle}
                  </h3>
                  {blockHtml ? (
                    <RichText
                      className="mt-1 text-muted-foreground text-sm"
                      html={blockHtml}
                    />
                  ) : null}
                </div>
              );
            case "headline":
              return (
                <div className="pt-4 first:pt-0" key={block.id}>
                  <h4 className="font-semibold text-foreground text-sm">
                    {blockTitle}
                  </h4>
                  {blockHtml ? (
                    <RichText
                      className="mt-1 text-muted-foreground text-sm"
                      html={blockHtml}
                    />
                  ) : null}
                </div>
              );
            case "subheading":
              return (
                <h5
                  className="pt-3 font-medium text-muted-foreground text-xs uppercase tracking-wide first:pt-0"
                  key={block.id}
                >
                  {blockTitle}
                </h5>
              );
            case "text":
              return (
                <RichText
                  className="prose prose-sm max-w-none py-2 text-foreground/90 text-sm"
                  html={blockHtml}
                  key={block.id}
                />
              );
            case "line_item":
              return (
                <LineItemRow
                  currency={currency}
                  item={toLineItem(block, fallbackTaxRate)}
                  key={block.id}
                  locale={locale}
                />
              );
            default:
              return null;
          }
        })}
      </div>

      {hasLineItems ? (
        <div className="mt-6">
          <CommercialBlockTotals
            blocks={totalsBlocks}
            currency={currency}
            defaultTaxRate={fallbackTaxRate}
            documentType={documentType}
            locale={locale}
            noTaxReason={noTaxReason}
            phaseIndexPattern={phaseIndexPattern}
            showPhaseIndex={showPhaseIndex}
            showPhaseTotals={showPhaseTotals}
            showTaxPerItem={showTaxPerItem}
          />
        </div>
      ) : null}

      {finalNotes ? (
        <RichText
          className="prose prose-sm mt-6 max-w-none border-border border-t pt-4 text-muted-foreground text-sm"
          html={finalNotes}
        />
      ) : null}
    </article>
  );
}
