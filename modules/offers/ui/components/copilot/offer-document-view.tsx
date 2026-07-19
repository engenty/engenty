"use client";

import {
  type CommercialBlock,
  CommercialDocumentView,
} from "@engenty/commercial-editor";
import { Skeleton } from "@engenty/ui-core";
import type { OfferBlock } from "../../api.js";
import { useOfferDetailPageQuery } from "../../queries.js";

/**
 * Chrome-less HTML rendering of the full offer document — the pane sibling of
 * the PDF template (docs/wip/generative-ui.md §3.1). Built on the detail-page
 * query, so the offers live binding + agent-tool invalidation refresh it in
 * place when the agent edits the offer.
 */

function toCommercialBlocks(blocks: OfferBlock[]): CommercialBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

export function OfferDocumentView({
  className,
  offerId,
}: {
  className?: string;
  offerId: string;
}) {
  const { data, isError, isPending } = useOfferDetailPageQuery(offerId);

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

  if (isError || !data?.offer) {
    return (
      <div className={className}>
        <p className="text-muted-foreground text-sm">
          This offer is not available.
        </p>
      </div>
    );
  }

  const { blocks, offer } = data;

  return (
    <CommercialDocumentView
      blocks={toCommercialBlocks(blocks)}
      className={className}
      currency={offer.currency}
      defaultTaxRate={offer.default_tax_rate}
      documentType="offer"
      finalNotes={offer.final_notes}
      introduction={offer.introduction}
      meta={[
        { label: "Date", value: offer.offer_date ?? "" },
        { label: "Valid until", value: offer.valid_until ?? "" },
        { label: "Reference", value: offer.reference ?? "" },
      ]}
      noTaxReason={offer.no_tax_reason}
      number={offer.offer_number}
      phaseIndexPattern={offer.phase_index_pattern}
      recipient={[
        offer.recipient_name,
        offer.recipient_address,
        offer.recipient_custom_info,
      ]}
      showPhaseIndex={offer.show_phase_index}
      showPhaseTotals={offer.phases_enabled && offer.show_phase_totals}
      showTaxPerItem={offer.show_tax_per_item}
      title={offer.title}
    />
  );
}
