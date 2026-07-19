"use client";

import {
  ObjectCardFrame,
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
import { Hash, Receipt } from "lucide-react";
import { useRef } from "react";
import type { InvoiceStatus } from "../../api.js";
import { useInvoiceDetailQuery } from "../../queries.js";
import { InvoiceDocumentView } from "./invoice-document-view.js";

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

function formatGross(amount?: number, currency?: string): string | undefined {
  if (typeof amount !== "number") {
    return;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency ?? ""}`.trim();
  }
}

function InvoiceRow({
  invoiceRef,
  snapshot,
  onOpenInPanel,
}: {
  invoiceRef: ObjectRef;
  snapshot?: ObjectDisplayItem;
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  const invoiceId = invoiceRef.id;
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
  const invoiceNumber = invoice?.number;

  return (
    <ObjectListRow
      actions={
        invoiceNumber
          ? [
              {
                icon: Hash,
                label: "Copy invoice number",
                onSelect: () =>
                  void navigator.clipboard?.writeText(invoiceNumber),
              },
            ]
          : undefined
      }
      href={`/mdl/invoices/${invoiceId}`}
      media={<Receipt className="size-4 text-muted-foreground/70" />}
      meta={formatGross(invoice?.sumBrutto, invoice?.currency)}
      objectRef={invoiceRef}
      onOpenInPanel={onOpenInPanel}
      subtitle={secondary}
      title={title}
      trailing={
        isError && !invoice ? (
          <span className="shrink-0 text-muted-foreground/70 text-xs">
            not available
          </span>
        ) : (
          <InvoiceStatusBadge status={invoice?.status ?? snapshot?.status} />
        )
      }
    />
  );
}

export function InvoiceObjectCard({
  refs,
  items,
  provenance,
  onOpenInPanel,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);

  return (
    <ObjectCardFrame>
      <ObjectRowList>
        {shown.map((ref) => (
          <InvoiceRow
            invoiceRef={ref}
            key={ref.id}
            onOpenInPanel={onOpenInPanel}
            snapshot={itemByRef.get(`invoices:invoice:${ref.id}`)}
          />
        ))}
      </ObjectRowList>
      <ObjectListFooter
        href="/mdl/invoices"
        label="invoices"
        overflow={refs.length - shown.length}
        shown={refs.length}
        total={provenance?.total}
      />
    </ObjectCardFrame>
  );
}

export function InvoiceObjectPanel({ objectRef }: ObjectWidgetPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: invoice } = useInvoiceDetailQuery(objectRef.id);
  const label = invoice
    ? [invoice.number, invoice.title].filter(Boolean).join(" — ")
    : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" ref={contentRef}>
        <InvoiceDocumentView className="p-4" invoiceId={objectRef.id} />
      </div>
      <ObjectPanelAskAgentBar
        contentRef={contentRef}
        label={label}
        objectRef={objectRef}
      />
    </div>
  );
}
