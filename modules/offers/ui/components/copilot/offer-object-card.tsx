"use client";

import {
  ObjectCardFrame,
  ObjectCardLink,
  type ObjectDisplayItem,
  ObjectListFooter,
  ObjectListRow,
  ObjectPanelAskAgentBar,
  type ObjectRef,
  ObjectRowList,
  type ObjectWidgetCardProps,
  type ObjectWidgetPanelProps,
} from "@engenty/ai-ui";
import { Badge, Skeleton } from "@engenty/ui-core";
import { FileText, Hash } from "lucide-react";
import { useRef } from "react";
import type { OfferStatus } from "../../api.js";
import { OfferDetailPage } from "../../pages/offer-detail-page.js";
import { useOfferDetailQuery } from "../../queries.js";

/**
 * Chat object widget for `offers:offer:<id>` refs — live data via the module
 * query (viewing user's session), snapshot items as loading/no-access
 * fallback.
 */

const LIST_INLINE_LIMIT = 10;

const STATUS_VARIANT: Record<OfferStatus, "default" | "secondary" | "outline"> =
  {
    draft: "outline",
    ready: "secondary",
    accepted: "default",
  };

function OfferStatusBadge({ status }: { status?: OfferStatus | string }) {
  if (!status) {
    return null;
  }
  const variant = STATUS_VARIANT[status as OfferStatus] ?? ("outline" as const);
  return (
    <Badge className="shrink-0 text-[10px] capitalize" variant={variant}>
      {status}
    </Badge>
  );
}

function OfferRow({
  offerRef,
  snapshot,
  onOpenInPanel,
}: {
  offerRef: ObjectRef;
  snapshot?: ObjectDisplayItem;
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  const offerId = offerRef.id;
  const { data: offer, isPending, isError } = useOfferDetailQuery(offerId);

  if (isPending && !snapshot) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Skeleton className="size-4 rounded" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    );
  }

  const title = offer
    ? [offer.offer_number, offer.title].filter(Boolean).join(" — ")
    : (snapshot?.title ?? offerId);
  const secondary = offer?.recipient_name ?? snapshot?.subtitle ?? null;
  const offerNumber = offer?.offer_number;

  return (
    <ObjectListRow
      actions={
        offerNumber
          ? [
              {
                icon: Hash,
                label: "Copy offer number",
                onSelect: () =>
                  void navigator.clipboard?.writeText(offerNumber),
              },
            ]
          : undefined
      }
      href={`/mdl/offers/${offerId}`}
      media={<FileText className="size-4 text-muted-foreground/70" />}
      meta={offer?.valid_until ? `valid to ${offer.valid_until}` : undefined}
      objectRef={offerRef}
      onOpenInPanel={onOpenInPanel}
      subtitle={secondary}
      title={title}
      trailing={
        isError && !offer ? (
          <span className="shrink-0 text-muted-foreground/70 text-xs">
            not available
          </span>
        ) : (
          <OfferStatusBadge status={offer?.status ?? snapshot?.status} />
        )
      }
    />
  );
}

function OfferSingleCard({
  offerId,
  offerRef,
  snapshot,
  onOpenInPanel,
}: {
  offerId: string;
  /** Omitted in the pane — the record is already open there. */
  offerRef?: ObjectRef;
  snapshot?: ObjectDisplayItem;
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  const { data: offer, isPending } = useOfferDetailQuery(offerId);

  if (isPending && !snapshot) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-36" />
      </div>
    );
  }

  const heading = offer
    ? [offer.offer_number, offer.title].filter(Boolean).join(" — ")
    : (snapshot?.title ?? offerId);

  const facts = (
    offer
      ? [
          ["Client", offer.recipient_name],
          ["Date", offer.offer_date],
          ["Valid until", offer.valid_until],
          ["Currency", offer.currency],
        ]
      : []
  ).filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <ObjectCardLink
      className="p-3"
      href={offerRef ? `/mdl/offers/${offerId}` : undefined}
      objectRef={offerRef}
      onOpenInPanel={onOpenInPanel}
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground/70" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-foreground text-sm">
              {heading}
            </span>
            <OfferStatusBadge status={offer?.status ?? snapshot?.status} />
          </div>
          {facts.length > 0 ? (
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
              {facts.map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="truncate text-foreground/90 text-sm">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : snapshot?.subtitle ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {snapshot.subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </ObjectCardLink>
  );
}

export function OfferObjectCard({
  refs,
  items,
  provenance,
  onOpenInPanel,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const snapshotFor = (id: string) => itemByRef.get(`offers:offer:${id}`);

  if (refs.length === 1) {
    const ref = refs[0];
    return (
      <ObjectCardFrame>
        <OfferSingleCard
          offerId={ref.id}
          offerRef={ref}
          onOpenInPanel={onOpenInPanel}
          snapshot={snapshotFor(ref.id)}
        />
      </ObjectCardFrame>
    );
  }

  const shown = refs.slice(0, LIST_INLINE_LIMIT);

  return (
    <ObjectCardFrame>
      <ObjectRowList>
        {shown.map((ref) => (
          <OfferRow
            key={ref.id}
            offerRef={ref}
            onOpenInPanel={onOpenInPanel}
            snapshot={snapshotFor(ref.id)}
          />
        ))}
      </ObjectRowList>
      <ObjectListFooter
        href="/mdl/offers"
        label="offers"
        overflow={refs.length - shown.length}
        shown={refs.length}
        total={provenance?.total}
      />
    </ObjectCardFrame>
  );
}

/**
 * The offer in a pane: the module's OWN page, embedded — so a draft is the
 * draft editor here too, and what is read beside a chat or a wizard is the
 * same thing `/mdl/offers/<id>` shows, editable, rather than a second,
 * read-only rendering that drifts from it.
 */
export function OfferObjectPanel({ objectRef }: ObjectWidgetPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: offer } = useOfferDetailQuery(objectRef.id);
  const label = offer
    ? [offer.offer_number, offer.title].filter(Boolean).join(" — ")
    : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        ref={contentRef}
      >
        <OfferDetailPage embedded offerId={objectRef.id} />
      </div>
      <ObjectPanelAskAgentBar
        contentRef={contentRef}
        label={label}
        objectRef={objectRef}
      />
    </div>
  );
}
