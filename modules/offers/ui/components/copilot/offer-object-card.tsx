"use client";

import type {
  ObjectDisplayItem,
  ObjectWidgetCardProps,
  ObjectWidgetPanelProps,
} from "@engenty/ai-ui";
import { Badge, cn, Skeleton } from "@engenty/ui-core";
import { ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OfferStatus } from "../../api.js";
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
  offerId,
  snapshot,
}: {
  offerId: string;
  snapshot?: ObjectDisplayItem;
}) {
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

  return (
    <Link
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
      to={`/mdl/offers/${offerId}`}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground/90 text-sm">
          {title}
        </div>
        {secondary ? (
          <div className="truncate text-muted-foreground text-xs">
            {secondary}
          </div>
        ) : null}
      </div>
      {isError && !offer ? (
        <span className="shrink-0 text-muted-foreground/70 text-xs">
          not available
        </span>
      ) : (
        <OfferStatusBadge status={offer?.status ?? snapshot?.status} />
      )}
    </Link>
  );
}

function OfferSingleCard({
  offerId,
  snapshot,
}: {
  offerId: string;
  snapshot?: ObjectDisplayItem;
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
    <div className="p-3">
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
        <Link
          className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to={`/mdl/offers/${offerId}`}
        >
          Open
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function OfferObjectCard({
  refs,
  items,
  provenance,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const snapshotFor = (id: string) => itemByRef.get(`offers:offer:${id}`);

  const frame = (children: ReactNode) => (
    <div
      className={cn(
        "ui-canvas-raised my-1 w-full overflow-hidden rounded-lg border-0 bg-card"
      )}
    >
      {children}
    </div>
  );

  if (refs.length === 1) {
    const ref = refs[0];
    return frame(
      <OfferSingleCard offerId={ref.id} snapshot={snapshotFor(ref.id)} />
    );
  }

  const shown = refs.slice(0, LIST_INLINE_LIMIT);
  const overflow = refs.length - shown.length;
  const total = provenance?.total;

  return frame(
    <>
      <div className="divide-y divide-border/50">
        {shown.map((ref) => (
          <OfferRow
            key={ref.id}
            offerId={ref.id}
            snapshot={snapshotFor(ref.id)}
          />
        ))}
      </div>
      {overflow > 0 || (total && total > refs.length) ? (
        <Link
          className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to="/mdl/offers"
        >
          {overflow > 0 ? `+${overflow} more · ` : ""}
          {total && total > refs.length
            ? `${refs.length} of ${total} — open offers`
            : "open offers"}
        </Link>
      ) : null}
    </>
  );
}

export function OfferObjectPanel({ objectRef }: ObjectWidgetPanelProps) {
  return (
    <div className="h-full overflow-y-auto">
      <OfferSingleCard offerId={objectRef.id} />
      <OfferPanelIntroduction offerId={objectRef.id} />
    </div>
  );
}

function OfferPanelIntroduction({ offerId }: { offerId: string }) {
  const { data: offer } = useOfferDetailQuery(offerId);
  if (!offer?.introduction) {
    return null;
  }
  return (
    <div className="px-3 pb-3">
      <div className="text-muted-foreground text-xs">Introduction</div>
      <p className="whitespace-pre-wrap text-foreground/90 text-sm">
        {offer.introduction}
      </p>
    </div>
  );
}
