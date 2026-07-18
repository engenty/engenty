"use client";

import {
  type CommercialBlock,
  CommercialDocumentView,
} from "@engenty/commercial-editor";
import { Skeleton } from "@engenty/ui-core";
import type { InvoiceBlock } from "../../api.js";
import { useInvoiceEditPageQuery } from "../../queries.js";

/**
 * Chrome-less HTML rendering of the full invoice document — mirror of the
 * offers OfferDocumentView (docs/wip/generative-ui.md §3.2). Built on module
 * queries, so the invoices live binding refreshes it when the agent edits.
 */

function toCommercialBlocks(blocks: InvoiceBlock[]): CommercialBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

export function InvoiceDocumentView({
  className,
  invoiceId,
}: {
  className?: string;
  invoiceId: string;
}) {
  const { data, isError, isPending } = useInvoiceEditPageQuery(invoiceId);

  if (isPending) {
    return (
      <div className={className}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data?.invoice) {
    return (
      <div className={className}>
        <p className="text-muted-foreground text-sm">
          This invoice is not available.
        </p>
      </div>
    );
  }

  const { blocks, invoice } = data;
  const recipient = invoice.recipientSnapshot;

  return (
    <CommercialDocumentView
      blocks={toCommercialBlocks(blocks)}
      className={className}
      currency={invoice.currency ?? "EUR"}
      defaultTaxRate={invoice.defaultTaxRate}
      documentType="invoice"
      finalNotes={invoice.finalNotes}
      introduction={invoice.introduction}
      meta={[
        { label: "Date", value: invoice.date ?? "" },
        { label: "Due", value: invoice.dueDate ?? "" },
        { label: "Reference", value: invoice.reference ?? "" },
      ]}
      number={invoice.number}
      phaseIndexPattern={invoice.phaseIndexPattern}
      recipient={
        recipient
          ? [
              recipient.displayName,
              recipient.address?.street,
              [recipient.address?.postalCode, recipient.address?.city]
                .filter(Boolean)
                .join(" "),
              recipient.address?.country,
            ]
          : []
      }
      showPhaseIndex={invoice.showPhaseIndex}
      showPhaseTotals={
        (invoice.phasesEnabled ?? false) && (invoice.showPhaseTotals ?? false)
      }
      showTaxPerItem={invoice.showTaxPerItem}
      title={invoice.title}
    />
  );
}
