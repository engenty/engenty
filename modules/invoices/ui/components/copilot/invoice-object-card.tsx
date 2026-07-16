"use client";

import type { ObjectDisplayItem, ObjectWidgetCardProps } from "@engenty/ai-ui";
import { Badge, cn, Skeleton } from "@engenty/ui-core";
import { Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import type { InvoiceStatus } from "../../api.js";
import { useInvoiceDetailQuery } from "../../queries.js";

/** Chat object widget for `invoices:invoice:<id>` refs — live data, viewer authz. */

const LIST_INLINE_LIMIT = 10;

function InvoiceStatusBadge({ status }: { status?: InvoiceStatus | string }) {
  if (!status) {
    return null;
  }
  return (
    <Badge
      className="shrink-0 text-[10px] capitalize"
      variant={status === "paid" ? "default" : "secondary"}
    >
      {String(status).replace(/_/g, " ")}
    </Badge>
  );
}

function InvoiceRow({
  invoiceId,
  snapshot,
}: {
  invoiceId: string;
  snapshot?: ObjectDisplayItem;
}) {
  const {
    data: invoice,
    isPending,
    isError,
  } = useInvoiceDetailQuery(invoiceId);

  if (isPending && !snapshot) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Skeleton className="size-4 rounded" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-44" />
        </div>
      </div>
    );
  }

  const recipient = invoice?.recipientSnapshot?.displayName;
  const title = invoice
    ? [invoice.number, recipient].filter(Boolean).join(" — ")
    : (snapshot?.title ?? invoiceId);
  const secondary = invoice?.dueDate
    ? `due ${invoice.dueDate.slice(0, 10)}`
    : snapshot?.subtitle;

  return (
    <Link
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
      to={`/mdl/invoices/${invoiceId}`}
    >
      <Receipt className="size-4 shrink-0 text-muted-foreground/70" />
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
      {isError && !invoice ? (
        <span className="shrink-0 text-muted-foreground/70 text-xs">
          not available
        </span>
      ) : (
        <InvoiceStatusBadge status={invoice?.status ?? snapshot?.status} />
      )}
    </Link>
  );
}

export function InvoiceObjectCard({
  refs,
  items,
  provenance,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);
  const overflow = refs.length - shown.length;
  const total = provenance?.total;

  return (
    <div
      className={cn(
        "my-1 w-full overflow-hidden rounded-lg bg-background ring-1 ring-border/60"
      )}
    >
      <div className="divide-y divide-border/50">
        {shown.map((ref) => (
          <InvoiceRow
            invoiceId={ref.id}
            key={ref.id}
            snapshot={itemByRef.get(`invoices:invoice:${ref.id}`)}
          />
        ))}
      </div>
      {overflow > 0 || (total && total > refs.length) ? (
        <Link
          className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to="/mdl/invoices"
        >
          {overflow > 0 ? `+${overflow} more · ` : ""}
          {total && total > refs.length
            ? `${refs.length} of ${total} — open invoices`
            : "open invoices"}
        </Link>
      ) : null}
    </div>
  );
}
