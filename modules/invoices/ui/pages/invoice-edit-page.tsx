import {
  BlockEditor,
  type CommercialBlock,
  CommercialBlockTotals,
  calculateTotals,
  DocumentFinalNotesBlock,
  DocumentIntroductionBlock,
  stripHtmlTags,
} from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import { PdfPreviewSheet } from "@engenty/pdf-templates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  buttonVariants,
  Card,
  CardContent,
  cn,
  DocSidebarLayout,
  DocSidebarToggle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
  useDocSidebar,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  Check,
  Download,
  FileText,
  MoreVertical,
  Save,
  Settings,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  InvoiceBlockInput,
  InvoiceBlockType,
  InvoiceListItem,
} from "../api.js";
import { downloadInvoicePdf, fetchInvoicePdf } from "../api.js";
import { InvoiceDocumentHeader } from "../components/invoice-document-header.js";
import { InvoiceSettingsPanel } from "../components/invoice-settings-panel.js";
import { InvoiceStatusBadge } from "../components/invoice-status-badge.js";
import { useInvoicesEditAgentUiSlice } from "../hooks/use-invoices-agent-ui-slice.js";
import { useInvoicesModuleSecondaryShellNav } from "../hooks/use-invoices-module-secondary-shell-nav.js";
import { useScrollCollapse } from "../lib/use-scroll-collapse.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useDeleteInvoiceMutation,
  useInvoiceEditPageQuery,
  useInvoiceModalContactsQuery,
  useInvoiceTaxRatesQuery,
  useIssueInvoiceMutation,
  useReplaceInvoiceBlocksMutation,
  useUpdateInvoiceMutation,
} from "../queries.js";

const INVOICE_DRAFT_DOC_SIDEBAR_KEY = "invoices.draft";

function toCommercialBlocks(
  blocks:
    | {
        id: string;
        type: string;
        content_json: Record<string, unknown>;
        order_index: number;
      }[]
    | null
    | undefined
): CommercialBlock[] {
  return (blocks ?? []).map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

function toBlockInputs(
  invoiceId: string,
  blocks: CommercialBlock[]
): InvoiceBlockInput[] {
  return blocks.map((block, index) => ({
    id: block.id,
    invoice_id: invoiceId,
    type: block.type as InvoiceBlockType,
    content_json: (block.content as Record<string, unknown>) ?? {},
    order_index: index,
  }));
}

/**
 * The invoice draft editor, as a page or embedded in a host pane.
 *
 * `embedded` matches `InvoiceDetailPage`'s: ids as props, no module secondary
 * nav, no `InvoiceDocumentHeader`, and no status redirect — the host chose this
 * editor from the record's phase and owns the URL.
 */
export function InvoiceEditPage(props?: {
  embedded?: boolean;
  invoiceId?: string;
}) {
  const embedded = props?.embedded ?? false;
  const { t } = useTranslation("invoices");
  const navigate = useNavigate();
  const routeParams = useParams<{ id: string }>();
  const id = props?.invoiceId ?? routeParams.id;

  const { data: pageData, isLoading } = useInvoiceEditPageQuery(id ?? null);
  const updateMutation = useUpdateInvoiceMutation();
  const replaceBlocksMutation = useReplaceInvoiceBlocksMutation();
  const issueMutation = useIssueInvoiceMutation();
  const deleteMutation = useDeleteInvoiceMutation();

  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const contactsQuery = useInvoiceModalContactsQuery(contactsPlugin);
  const entities = useMemo(
    () => contactsQuery.data ?? [],
    [contactsQuery.data]
  );
  const taxRatesQuery = useInvoiceTaxRatesQuery();
  const taxRates = useMemo(
    () => taxRatesQuery.data ?? [],
    [taxRatesQuery.data]
  );

  const [invoice, setInvoice] = useState<InvoiceListItem | null>(null);
  const [blocks, setBlocks] = useState<CommercialBlock[]>([]);
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingFinalNotes, setEditingFinalNotes] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const settingsSidebar = useDocSidebar(INVOICE_DRAFT_DOC_SIDEBAR_KEY);
  const settingsSidebarOpen = settingsSidebar.open;
  const settingsSidebarToggle = settingsSidebar.toggle;
  const openSettings = useCallback(() => {
    if (!settingsSidebarOpen) {
      settingsSidebarToggle();
    }
  }, [settingsSidebarOpen, settingsSidebarToggle]);
  // Only widen the content column when the sidebar occupies an inline column.
  const settingsInlineOpen =
    settingsSidebar.mode === "inline" && settingsSidebarOpen;
  const contentMaxWidthClass = settingsInlineOpen ? "max-w-7xl" : "max-w-6xl";
  const {
    collapsed: headerCollapsed,
    onScroll,
    scrollRef,
  } = useScrollCollapse();
  const syncedRef = useRef(false);

  // Optimistic local edit + fire-and-forget update for settings/header fields.
  const patchInvoice = useCallback(
    (patch: Partial<InvoiceListItem>) => {
      setInvoice((cur) => (cur ? { ...cur, ...patch } : cur));
      if (id) {
        updateMutation.mutate({ id, patch });
      }
    },
    [id, updateMutation]
  );

  useEffect(() => {
    syncedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!pageData || syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    setInvoice(pageData.invoice);
    setBlocks(toCommercialBlocks(pageData.blocks));
  }, [pageData]);

  // Only drafts are editable (immutability boundary). Embedded, the host
  // already picked this view from the phase and owns the URL, so a status
  // change must not navigate the reader out of the pane.
  useEffect(() => {
    if (!embedded && invoice && invoice.status !== "draft") {
      navigate(`/mdl/invoices/${invoice.id}`, { replace: true });
    }
  }, [embedded, invoice, navigate]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInvoicesModuleSecondaryShellNav();

  const saving = updateMutation.isPending || replaceBlocksMutation.isPending;

  const persist = useCallback(async () => {
    if (!invoice) {
      return;
    }
    await updateMutation.mutateAsync({
      id: invoice.id,
      patch: {
        title: invoice.title ?? null,
        introduction: invoice.introduction ?? null,
        finalNotes: invoice.finalNotes ?? null,
        reference: invoice.reference ?? null,
      },
    });
    await replaceBlocksMutation.mutateAsync({
      id: invoice.id,
      blocks: toBlockInputs(invoice.id, blocks),
    });
  }, [blocks, invoice, replaceBlocksMutation, updateMutation]);

  const handleSave = useCallback(async () => {
    try {
      await persist();
      navigate(`/mdl/invoices/${invoice?.id ?? ""}`);
    } catch {
      // surfaced via mutation state
    }
  }, [persist, navigate, invoice?.id]);

  const handleIssue = useCallback(async () => {
    if (!invoice) {
      return;
    }
    try {
      await persist();
      await issueMutation.mutateAsync(invoice.id);
      navigate(`/mdl/invoices/${invoice.id}`);
    } catch {
      // surfaced via mutation state
    }
  }, [invoice, persist, issueMutation, navigate]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!invoice) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(invoice.id);
      navigate("/mdl/invoices");
    } catch {
      // surfaced via mutation state
    }
  }, [invoice, deleteMutation, navigate]);

  const handleDownloadPdf = useCallback(async () => {
    if (!invoice) {
      return;
    }
    setDownloadingPdf(true);
    try {
      await downloadInvoicePdf(
        invoice.id,
        `${invoice.number ?? "invoice"}.pdf`
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDownloadingPdf(false);
    }
  }, [invoice]);

  // Draft-phase PDF preview (legacy engency parity): persist what's on
  // screen, render server-side, show in the in-app sheet.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const handlePreviewPdf = useCallback(async () => {
    if (!invoice) {
      return;
    }
    setPreviewLoading(true);
    try {
      await persist();
      const { blob } = await fetchInvoicePdf(invoice.id);
      setPreviewBlob(blob);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setPreviewLoading(false);
    }
  }, [invoice, persist]);

  const actions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          className={topbarIconButtonClassName}
          disabled={saving}
          onClick={handleSave}
          size="sm"
        >
          <Save className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>
            {saving ? t("saving") : t("saveChanges")}
          </TopbarActionLabel>
        </Button>
        <Button
          className={topbarIconButtonClassName}
          disabled={saving || issueMutation.isPending}
          onClick={handleIssue}
          size="sm"
          variant="outline"
        >
          <Check className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>
            {t("issueAction", { defaultValue: "Issue invoice" })}
          </TopbarActionLabel>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("actionsMenu", { defaultValue: "Actions" })}
              className={topbarIconButtonClassName}
              size="sm"
              variant="outline"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={saving || issueMutation.isPending}
              onClick={handleIssue}
            >
              <Check className="mr-2 h-4 w-4" />
              {t("issueAction", { defaultValue: "Issue invoice" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={saving || previewLoading}
              onClick={handlePreviewPdf}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t("previewPdf", { defaultValue: "Preview PDF" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={downloadingPdf}
              onClick={handleDownloadPdf}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("downloadPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openSettings}>
              <Settings className="mr-2 h-4 w-4" />
              {t("settingsAction")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("delete", { defaultValue: "Delete" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [
      downloadingPdf,
      handleDownloadPdf,
      handleIssue,
      handlePreviewPdf,
      handleSave,
      issueMutation.isPending,
      openSettings,
      previewLoading,
      saving,
      t,
    ]
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: invoice?.number ?? t("draft", { defaultValue: "Draft" }) },
    ],
    [moduleRootCrumb, invoice?.number, t]
  );

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    // Embedded: the host owns the secondary column, and there is no
    // InvoiceDocumentHeader for a transparent topbar to blend into or float over.
    ...(embedded
      ? {}
      : {
          secondaryNavAfterItems,
          secondaryNavHeaderSlot,
          // Float the transparent topbar over the white DocumentHeader.
          topbarOverlap: true,
        }),
  });
  useInvoicesEditAgentUiSlice(invoice);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
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
  const defaultTaxRate = invoice.defaultTaxRate ?? 20;
  const totals = calculateTotals(blocks, defaultTaxRate);
  const clientName =
    (invoice.clientId
      ? entities.find((e) => e.id === invoice.clientId)?.display_name
      : undefined) ??
    invoice.recipientSnapshot?.displayName ??
    (invoice.status === "draft" && contactsPlugin
      ? t("noClientSelected")
      : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {embedded ? null : (
        <InvoiceDocumentHeader
          clientId={contactsPlugin ? invoice.clientId : null}
          clientName={clientName}
          collapsed={headerCollapsed}
          compactStatus={<InvoiceStatusBadge status={invoice.status} />}
          compactTitle={
            invoice.title ||
            invoice.number ||
            t("invoiceTitle", { defaultValue: "Invoice title" })
          }
          onChangeClient={openSettings}
          onTitleBlur={() => patchInvoice({ title: invoice.title ?? "" })}
          onTitleChange={(title) =>
            setInvoice((cur) => (cur ? { ...cur, title } : cur))
          }
          showChangeClient={Boolean(contactsPlugin)}
          showLinkToClient={Boolean(contactsPlugin)}
          status={invoice.status}
          title={invoice.title ?? ""}
          titlePlaceholder={t("invoiceTitle", {
            defaultValue: "Invoice title",
          })}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col bg-card/30">
        <div className="flex h-11 shrink-0 items-center">
          <div
            className={cn(
              "mx-auto flex w-full items-center justify-end px-page",
              contentMaxWidthClass
            )}
          >
            <DocSidebarToggle
              label={t("toggleInvoiceSettings")}
              storageKey={INVOICE_DRAFT_DOC_SIDEBAR_KEY}
              text={t("settingsAction")}
            />
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={onScroll}
          ref={scrollRef}
        >
          <DocSidebarLayout
            className={cn("p-page", contentMaxWidthClass)}
            inlineMinWidth={1200}
            resizable
            sidebar={
              <InvoiceSettingsPanel
                entities={entities}
                entitiesAvailable={Boolean(contactsPlugin)}
                invoice={invoice}
                onChange={patchInvoice}
                onDelete={() => setDeleteConfirmOpen(true)}
                settingsTaxRates={taxRates}
              />
            }
            sidebarLabel={t("settingsPanelTitle")}
            storageKey={INVOICE_DRAFT_DOC_SIDEBAR_KEY}
          >
            <section className="w-full space-y-4">
              <Card className="w-full bg-card">
                <CardContent className="space-y-5 p-6">
                  <DocumentIntroductionBlock
                    content={invoice.introduction ?? ""}
                    documentType="invoice"
                    isEditing={editingIntro}
                    onChange={(content) =>
                      setInvoice((cur) =>
                        cur
                          ? {
                              ...cur,
                              introduction:
                                stripHtmlTags(content).trim() === ""
                                  ? ""
                                  : content,
                            }
                          : cur
                      )
                    }
                    onEditingChange={setEditingIntro}
                    resolvedContent={invoice.introduction ?? ""}
                  />

                  <BlockEditor
                    blocks={blocks}
                    currency={currency}
                    documentStatus={invoice.status}
                    documentType="invoice"
                    offerSettings={{
                      show_phase_index: invoice.showPhaseIndex,
                      phase_index_pattern: invoice.phaseIndexPattern,
                      show_tax_per_item: invoice.showTaxPerItem,
                      default_tax_rate: defaultTaxRate,
                      show_phase_totals: invoice.showPhaseTotals,
                    }}
                    onChange={setBlocks}
                    taxRates={taxRates}
                  />

                  <CommercialBlockTotals
                    blocks={blocks as never}
                    currency={currency}
                    defaultTaxRate={defaultTaxRate}
                    documentType="invoice"
                    hideWhenNoItems={false}
                    locale="de-DE"
                    phaseIndexPattern={invoice.phaseIndexPattern ?? "1."}
                    showPhaseIndex={invoice.showPhaseIndex ?? true}
                    showPhaseTotals={
                      (invoice.phasesEnabled ?? false) &&
                      (invoice.showPhaseTotals ?? false)
                    }
                    showTaxPerItem={invoice.showTaxPerItem ?? true}
                  />

                  <DocumentFinalNotesBlock
                    content={invoice.finalNotes ?? ""}
                    documentType="invoice"
                    isEditing={editingFinalNotes}
                    onChange={(content: string) =>
                      setInvoice((cur) =>
                        cur
                          ? {
                              ...cur,
                              finalNotes:
                                stripHtmlTags(content).trim() === ""
                                  ? ""
                                  : content,
                            }
                          : cur
                      )
                    }
                    onEditingChange={setEditingFinalNotes}
                    resolvedContent={invoice.finalNotes ?? ""}
                    showBorder={false}
                  />

                  <p className="text-muted-foreground text-xs">
                    {t("draftTotalsHint", {
                      defaultValue:
                        "Totals: {{net}} net · {{tax}} tax · {{gross}} gross",
                      net: totals.net.toFixed(2),
                      tax: totals.tax.toFixed(2),
                      gross: totals.gross.toFixed(2),
                    })}
                  </p>
                </CardContent>
              </Card>
            </section>
          </DocSidebarLayout>
        </div>
      </div>

      <PdfPreviewSheet
        blob={previewBlob}
        downloadLabel={t("downloadPdf", { defaultValue: "Download PDF" })}
        fileName={`${invoice.number ?? "invoice"}.pdf`}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        title={
          invoice.number ?? t("previewPdf", { defaultValue: "Preview PDF" })
        }
      />

      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteInvoiceConfirm", {
                defaultValue: "Delete this invoice?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteInvoiceConfirmDescription", {
                defaultValue: "This action cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                handleDeleteConfirmed();
              }}
            >
              {t("delete", { defaultValue: "Delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
