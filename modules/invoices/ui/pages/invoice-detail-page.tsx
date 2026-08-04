import {
  BlockEditor,
  type CommercialBlock,
  CommercialBlockTotals,
  sanitizeHtml,
} from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Ban, Download, Pencil, Send, Wallet } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadInvoicePdf } from "../api.js";
import { InvoiceDocumentHeader } from "../components/invoice-document-header.js";
import { InvoiceStatusBadge } from "../components/invoice-status-badge.js";
import { useInvoicesDetailAgentUiSlice } from "../hooks/use-invoices-agent-ui-slice.js";
import { useInvoicesModuleSecondaryShellNav } from "../hooks/use-invoices-module-secondary-shell-nav.js";
import { useScrollCollapse } from "../lib/use-scroll-collapse.js";
import {
  useCancelInvoiceMutation,
  useInvoiceEditPageQuery,
  useSetInvoiceStatusMutation,
} from "../queries.js";

function toCommercialBlocks(
  blocks: {
    id: string;
    type: string;
    content_json: Record<string, unknown>;
    order_index: number;
  }[]
): CommercialBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

export function InvoiceDetailPage() {
  const { t } = useTranslation("invoices");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: pageData, isLoading } = useInvoiceEditPageQuery(id ?? null);
  const setStatusMutation = useSetInvoiceStatusMutation();
  const cancelMutation = useCancelInvoiceMutation();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const {
    collapsed: headerCollapsed,
    onScroll,
    scrollRef,
  } = useScrollCollapse();

  const invoice = pageData?.invoice ?? null;
  const blocks = useMemo(
    () => toCommercialBlocks(pageData?.blocks ?? []),
    [pageData?.blocks]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInvoicesModuleSecondaryShellNav();

  const handleDownload = useCallback(async () => {
    if (!invoice) {
      return;
    }
    try {
      await downloadInvoicePdf(invoice.id, `${invoice.number}.pdf`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t("loadFailed"));
    }
  }, [invoice, t]);

  const status = invoice?.status ?? "draft";

  const actions = useMemo(() => {
    if (!invoice) {
      return null;
    }
    const busy = setStatusMutation.isPending || cancelMutation.isPending;
    return (
      <div className="flex items-center gap-2">
        {status === "draft" ? (
          <Button
            className={topbarIconButtonClassName}
            onClick={() => navigate(`/mdl/invoices/${invoice.id}/draft`)}
            size="sm"
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            <TopbarActionLabel>{t("edit")}</TopbarActionLabel>
          </Button>
        ) : null}
        {status === "issued" ? (
          <Button
            className={topbarIconButtonClassName}
            disabled={busy}
            onClick={() =>
              setStatusMutation.mutate({ id: invoice.id, status: "sent" })
            }
            size="sm"
            variant="outline"
          >
            <Send className="mr-1.5 h-4 w-4" />
            <TopbarActionLabel>
              {t("markSent", { defaultValue: "Mark sent" })}
            </TopbarActionLabel>
          </Button>
        ) : null}
        {status === "issued" || status === "sent" ? (
          <Button
            className={topbarIconButtonClassName}
            disabled={busy}
            onClick={() =>
              setStatusMutation.mutate({ id: invoice.id, status: "paid" })
            }
            size="sm"
            variant="outline"
          >
            <Wallet className="mr-1.5 h-4 w-4" />
            <TopbarActionLabel>
              {t("markPaid", { defaultValue: "Mark paid" })}
            </TopbarActionLabel>
          </Button>
        ) : null}
        {status !== "draft" && status !== "cancelled" ? (
          <Button
            className={topbarIconButtonClassName}
            disabled={busy}
            onClick={() => cancelMutation.mutate(invoice.id)}
            size="sm"
            variant="outline"
          >
            <Ban className="mr-1.5 h-4 w-4" />
            <TopbarActionLabel>
              {t("cancelInvoice", { defaultValue: "Storno" })}
            </TopbarActionLabel>
          </Button>
        ) : null}
        <Button
          className={topbarIconButtonClassName}
          onClick={handleDownload}
          size="sm"
          variant="outline"
        >
          <Download className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>{t("downloadPdf")}</TopbarActionLabel>
        </Button>
      </div>
    );
  }, [
    invoice,
    status,
    setStatusMutation,
    cancelMutation,
    handleDownload,
    navigate,
    t,
  ]);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: invoice?.number ?? "" },
    ],
    [moduleRootCrumb, invoice?.number]
  );

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white DocumentHeader so they blend.
    topbarOverlap: true,
  });
  useInvoicesDetailAgentUiSlice(invoice);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }
  if (!invoice) {
    return (
      <p className="p-page text-muted-foreground text-sm">
        {t("notFound", { defaultValue: "Invoice not found." })}
      </p>
    );
  }

  const currency = invoice.currency || "EUR";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InvoiceDocumentHeader
        clientId={invoice.clientId}
        clientName={invoice.recipientSnapshot?.displayName}
        collapsed={headerCollapsed}
        compactStatus={<InvoiceStatusBadge status={status} />}
        compactTitle={invoice.title || invoice.number}
        isReadOnly
        onTitleChange={() => undefined}
        showChangeClient={false}
        showLinkToClient={Boolean(invoice.clientId)}
        status={status}
        title={invoice.title || invoice.number}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={onScroll}
        ref={scrollRef}
      >
        <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
          <Card className="w-full bg-card">
            <CardContent className="space-y-5 p-6">
              <p className="text-muted-foreground text-sm">
                {invoice.number} · {invoice.date} · {t("due")}:{" "}
                {invoice.dueDate}
              </p>

              {invoice.introduction ? (
                <div
                  className="prose dark:prose-invert max-w-none text-sm [&_*:last-child]:mb-0"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: rich-text rendered through the shared sanitizer
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(invoice.introduction),
                  }}
                />
              ) : null}

              <BlockEditor
                blocks={blocks}
                currency={currency}
                documentStatus={status}
                documentType="invoice"
                isReadOnly
                onChange={() => undefined}
              />

              <CommercialBlockTotals
                blocks={blocks as never}
                currency={currency}
                defaultTaxRate={invoice.defaultTaxRate ?? 20}
                documentType="invoice"
                hideWhenNoItems={false}
                locale="de-DE"
                showTaxPerItem={invoice.showTaxPerItem ?? true}
              />

              {invoice.finalNotes ? (
                <div
                  className="prose dark:prose-invert max-w-none text-muted-foreground text-sm [&_*:last-child]:mb-0"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: rich-text rendered through the shared sanitizer
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(invoice.finalNotes),
                  }}
                />
              ) : null}

              {downloadError ? (
                <p className="text-red-700 text-sm dark:text-red-300">
                  {downloadError}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
