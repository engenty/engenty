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
  Button,
  Card,
  CardContent,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Check, FileText, Save, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  InvoiceBlockInput,
  InvoiceBlockType,
  InvoiceListItem,
} from "../api.js";
import { fetchInvoicePdf } from "../api.js";
import { InvoiceDocumentHeader } from "../components/invoice-document-header.js";
import { InvoiceSettingsPanel } from "../components/invoice-settings-panel.js";
import { useInvoicesModuleSecondaryShellNav } from "../hooks/use-invoices-module-secondary-shell-nav.js";
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

export function InvoiceEditPage() {
  const { t } = useTranslation("invoices");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Only drafts are editable (immutability boundary).
  useEffect(() => {
    if (invoice && invoice.status !== "draft") {
      navigate(`/mdl/invoices/${invoice.id}`, { replace: true });
    }
  }, [invoice, navigate]);

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

  const handleDelete = useCallback(async () => {
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
          onClick={() => setSettingsOpen(true)}
          size="sm"
          variant="outline"
        >
          <Settings className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>{t("settingsAction")}</TopbarActionLabel>
        </Button>
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
        <Button
          className={topbarIconButtonClassName}
          disabled={saving || previewLoading}
          onClick={handlePreviewPdf}
          size="sm"
          variant="outline"
        >
          <FileText className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>
            {previewLoading
              ? t("saving")
              : t("previewPdf", { defaultValue: "Preview PDF" })}
          </TopbarActionLabel>
        </Button>
      </div>
    ),
    [
      handleIssue,
      handlePreviewPdf,
      handleSave,
      issueMutation.isPending,
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
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

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
      <InvoiceDocumentHeader
        clientId={contactsPlugin ? invoice.clientId : null}
        clientName={clientName}
        onChangeClient={() => setSettingsOpen(true)}
        onTitleBlur={() => patchInvoice({ title: invoice.title ?? "" })}
        onTitleChange={(title) =>
          setInvoice((cur) => (cur ? { ...cur, title } : cur))
        }
        showChangeClient={Boolean(contactsPlugin)}
        showLinkToClient={Boolean(contactsPlugin)}
        status={invoice.status}
        title={invoice.title ?? ""}
        titlePlaceholder={t("invoiceTitle", { defaultValue: "Invoice title" })}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
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
                            stripHtmlTags(content).trim() === "" ? "" : content,
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
                            stripHtmlTags(content).trim() === "" ? "" : content,
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
      </div>

      <InvoiceSettingsPanel
        entities={entities}
        entitiesAvailable={Boolean(contactsPlugin)}
        invoice={invoice}
        onChange={patchInvoice}
        onDelete={handleDelete}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        settingsTaxRates={taxRates}
      />

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
    </div>
  );
}
