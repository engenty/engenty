import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import {
  BlockEditor,
  type CommercialBlock,
  CommercialBlockTotals,
  calculateTotals,
  DocumentFinalNotesBlock,
  DocumentIntroductionBlock,
  DocumentTitleBlock,
  stripHtmlTags,
} from "@engenty/commercial-editor";
import {
  buildPlaceholderContext,
  resolvePlaceholders,
} from "@engenty/commercial-editor/placeholders";
import type { CommercialSettings } from "@engenty/commercial-settings/ui";
import type { CompanyProfileSettings } from "@engenty/company-profile/ui";
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
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
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
import type { OfferBlock, OfferBlockType, OfferListItem } from "../api.js";
import { downloadOfferPdf } from "../api.js";
import { ClientTopline } from "../components/client-topline.js";
import { DocumentHeader } from "../components/document-header.js";
import { DocumentTitle } from "../components/document-title.js";
import { OfferMetadataInline } from "../components/offer-metadata-inline.js";
import { OfferRecipientBlock } from "../components/offer-recipient-block.js";
import { OfferSenderBlock } from "../components/offer-sender-block.js";
import { OfferSettingsPanel } from "../components/offer-settings-panel.js";
import { OfferStatusBadge } from "../components/offer-status-badge.js";
import { OfferStatusStepper } from "../components/offer-status-stepper.js";
import { useOffersModuleSecondaryShellNav } from "../hooks/use-offers-module-secondary-shell-nav.js";
import {
  normalizeCommercialTaxRates,
  resolveDefaultTaxRateFromCommercial,
} from "../lib/commercial-tax-rates.js";
import { formatContactSnapshot } from "../lib/contact-snapshot.js";
import { saveOfferPdf } from "../lib/offer-pdf.js";
import { useScrollCollapse } from "../lib/use-scroll-collapse.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useDeleteOfferMutation,
  useOfferEditContactsQuery,
  useOfferEditPageQuery,
  useReplaceOfferBlocksMutation,
  useUpdateOfferMutation,
} from "../queries.js";

const OFFER_DRAFT_DOC_SIDEBAR_KEY = "offers.draft";

// The former offers_apply_draft_patch / offers_apply_blocks_patch frontend
// tools were removed deliberately: agents edit offers through the backend
// operations (offers_update / offers_replace_blocks — approval-gated with
// durable grants), and this editor follows those writes live via the offers
// realtime binding. Frontend staging tools only worked with the edit page
// open, were invisible to the agent's reads, and duplicated the write path.

function toCommercialBlocks(blocks: OfferBlock[]): CommercialBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

interface OfferContactListItem {
  address_city: string | null;
  address_country: string | null;
  address_info: string | null;
  address_street: string | null;
  address_zip: string | null;
  contact_name: string;
  display_name: string;
  email: string | null;
  id: string;
  vat_id: string | null;
}

interface EditorUnitOption {
  is_default: boolean;
  label: string;
  singular?: string;
  value: string;
}

function normalizeCommercialUnits(rawUnits: unknown): EditorUnitOption[] {
  const source = Array.isArray(rawUnits) ? rawUnits : [];
  const normalized: EditorUnitOption[] = [];
  for (const entry of source) {
    const unit = (entry ?? {}) as Record<string, unknown>;
    const rawValue =
      (typeof unit.name === "string" && unit.name) ||
      (typeof unit.value === "string" && unit.value) ||
      (typeof unit.abbreviation === "string" && unit.abbreviation) ||
      "";
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const rawPlural =
      (typeof unit.label === "string" && unit.label) ||
      (typeof unit.plural === "string" && unit.plural) ||
      value;
    const rawSingular =
      (typeof unit.singular === "string" && unit.singular) || undefined;
    normalized.push({
      value,
      label: rawPlural.trim() || value,
      singular: rawSingular?.trim() || undefined,
      is_default: false,
    });
  }

  const merged = new Map(normalized.map((unit) => [unit.value, unit]));
  const builtIns: EditorUnitOption[] = [
    { value: "text", label: "Text", singular: "Text", is_default: false },
    { value: "fixed", label: "Fixed", singular: "Fixed", is_default: false },
    { value: "h", label: "Hours", singular: "Hour", is_default: false },
    { value: "d", label: "Days", singular: "Day", is_default: false },
  ];
  for (const unit of builtIns) {
    if (!merged.has(unit.value)) {
      merged.set(unit.value, unit);
    }
  }

  const units = Array.from(merged.values());
  const defaultUnitValue =
    units.find((unit) => unit.value === "h")?.value ?? units[0]?.value ?? "h";
  return units.map((unit) => ({
    ...unit,
    is_default: unit.value === defaultUnitValue,
  }));
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString("de-DE");
}

function buildTaxBreakdown(blocks: CommercialBlock[]): Array<{
  amount: number;
  rate: number;
}> {
  const taxMap = new Map<number, number>();
  for (const block of blocks) {
    if (block.type !== "line_item") {
      continue;
    }
    const content =
      (block.content as Record<string, unknown> | null | undefined) ?? {};
    const amount = Number(content.amount ?? 0);
    const costPerItem = Number(content.cost_per_item ?? 0);
    const subtotal = amount * costPerItem;
    const taxRate = Number(content.tax ?? 0);
    const taxAmount = subtotal * (taxRate / 100);
    if (taxAmount > 0) {
      taxMap.set(taxRate, (taxMap.get(taxRate) ?? 0) + taxAmount);
    }
  }
  return Array.from(taxMap.entries())
    .map(([rate, amount]) => ({ rate, amount }))
    .sort((a, b) => b.rate - a.rate);
}

export function OfferEditPage() {
  const { t } = useTranslation("offers");
  const { currentTenant } = useWorkspaceContext();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const contactsPlugin = getContactsPluginApi();

  const { data: pageData, isLoading: loading } = useOfferEditPageQuery(
    id ?? null
  );
  const { data: entities = [] } = useOfferEditContactsQuery(contactsPlugin);

  const updateMutation = useUpdateOfferMutation(id ?? null);
  const replaceBlocksMutation = useReplaceOfferBlocksMutation(id ?? null);
  const deleteMutation = useDeleteOfferMutation({});

  const [offer, setOffer] = useState<OfferListItem | null>(null);
  const [blocks, setBlocks] = useState<CommercialBlock[]>([]);
  const [companyProfile, setCompanyProfile] =
    useState<CompanyProfileSettings | null>(null);
  const [commercialSettings, setCommercialSettings] =
    useState<CommercialSettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const settingsSidebar = useDocSidebar(OFFER_DRAFT_DOC_SIDEBAR_KEY);
  const settingsSidebarOpen = settingsSidebar.open;
  const settingsSidebarToggle = settingsSidebar.toggle;
  const openSettings = useCallback(() => {
    if (!settingsSidebarOpen) {
      settingsSidebarToggle();
    }
  }, [settingsSidebarOpen, settingsSidebarToggle]);
  // Only widen the content column when the sidebar actually occupies an
  // inline column; when it's closed (or an overlay) the document keeps its
  // natural reading width.
  const settingsInlineOpen =
    settingsSidebar.mode === "inline" && settingsSidebarOpen;
  const contentMaxWidthClass = settingsInlineOpen ? "max-w-7xl" : "max-w-6xl";
  const {
    collapsed: headerCollapsed,
    onScroll,
    scrollRef,
  } = useScrollCollapse();
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingFinalNotes, setEditingFinalNotes] = useState(false);
  const initialSyncedRef = useRef(false);

  const normalizedEditorTaxRates = useMemo(
    () => normalizeCommercialTaxRates(commercialSettings?.tax_rates),
    [commercialSettings?.tax_rates]
  );
  const tenantFallbackTaxRate = useMemo(
    () => resolveDefaultTaxRateFromCommercial(normalizedEditorTaxRates),
    [normalizedEditorTaxRates]
  );

  // Last server state this editor adopted. Local `offer`/`blocks` staying
  // reference-equal to it means the user has no unsaved edits (every local
  // mutation produces new objects), so external writes can be adopted live.
  const adoptedRef = useRef<{
    blocks: CommercialBlock[];
    offer: OfferListItem | null;
    serverJson: string;
  }>({ blocks: [], offer: null, serverJson: "" });
  const [externalChange, setExternalChange] = useState(false);

  const adoptServerState = useCallback(
    (data: NonNullable<typeof pageData>, serverJson: string) => {
      const nextBlocks = toCommercialBlocks(data.blocks);
      adoptedRef.current = {
        blocks: nextBlocks,
        offer: data.offer,
        serverJson,
      };
      setOffer(data.offer);
      setBlocks(nextBlocks);
      setExternalChange(false);
    },
    []
  );

  useEffect(() => {
    initialSyncedRef.current = false;
  }, [id]);

  // Seed on first load, then keep following the server: the offers live
  // binding invalidates this query whenever an agent (or another tab) writes
  // the offer or its blocks. Pristine local state adopts the fresh server
  // state immediately; unsaved local edits surface a conflict banner instead
  // of being clobbered.
  useEffect(() => {
    if (!pageData) {
      return;
    }
    const serverJson = JSON.stringify({
      b: pageData.blocks,
      o: pageData.offer,
    });
    if (!initialSyncedRef.current) {
      initialSyncedRef.current = true;
      adoptServerState(pageData, serverJson);
      setCompanyProfile(pageData.companyProfile);
      setCommercialSettings(pageData.commercialSettings);
      return;
    }
    if (serverJson === adoptedRef.current.serverJson) {
      return;
    }
    const pristine =
      offer === adoptedRef.current.offer &&
      blocks === adoptedRef.current.blocks;
    if (pristine) {
      adoptServerState(pageData, serverJson);
    } else {
      setExternalChange(true);
    }
  }, [pageData, offer, blocks, adoptServerState]);

  useEffect(() => {
    if (!offer) {
      return;
    }
    if (offer.status !== "draft") {
      navigate(`/mdl/offers/${offer.id}`, { replace: true });
    }
  }, [offer, navigate]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useOffersModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      {
        label: offer?.title ?? t("draft"),
        to: id ? `/mdl/offers/${id}` : "/mdl/offers",
      },
      { label: t("draft") },
    ],
    [id, moduleRootCrumb, offer?.title, t]
  );

  const saving = updateMutation.isPending || replaceBlocksMutation.isPending;

  /** Persist the current editor state (offer fields + block list). */
  const persistDraft = useCallback(
    async (patch?: Partial<OfferListItem>) => {
      if (!offer) {
        return false;
      }
      await updateMutation.mutateAsync({ ...offer, ...patch });
      await replaceBlocksMutation.mutateAsync(
        blocks.map((block, index) => ({
          id: block.id,
          offer_id: offer.id,
          type: block.type as OfferBlockType,
          content_json: block.content as Record<string, unknown>,
          order_index: index,
        }))
      );
      // Local state is the server state now — mark it adopted so the
      // save-triggered realtime refetch syncs cleanly instead of flagging a
      // false conflict.
      adoptedRef.current = { blocks, offer, serverJson: "" };
      setExternalChange(false);
      return true;
    },
    [blocks, offer, replaceBlocksMutation, updateMutation]
  );

  const handleSave = useCallback(async () => {
    if (!offer) {
      return;
    }
    try {
      await persistDraft();
      navigate(
        offer.status === "draft"
          ? `/mdl/offers/${offer.id}/draft`
          : `/mdl/offers/${offer.id}`
      );
    } catch {
      // Error surfaced via mutation
    }
  }, [navigate, offer, persistDraft]);

  const handleMarkAsReady = useCallback(async () => {
    if (!offer) {
      return;
    }
    try {
      await persistDraft({ status: "ready" });
      navigate(`/mdl/offers/${offer.id}`);
    } catch {
      // Error surfaced via mutation
    }
  }, [navigate, offer, persistDraft]);

  // Draft-phase PDF preview (legacy engency parity): persist what's on
  // screen, render server-side, show in the in-app sheet.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const handlePreviewPdf = useCallback(async () => {
    if (!offer) {
      return;
    }
    setPreviewLoading(true);
    try {
      await persistDraft();
      setPreviewBlob(await downloadOfferPdf(offer.id));
      setPreviewOpen(true);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setPreviewLoading(false);
    }
  }, [offer, persistDraft]);

  const handleDownloadPdf = useCallback(async () => {
    if (!offer) {
      return;
    }
    setDownloadingPdf(true);
    try {
      await saveOfferPdf(offer.id, `${offer.offer_number ?? "offer"}.pdf`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDownloadingPdf(false);
    }
  }, [offer]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!offer) {
      return;
    }
    await deleteMutation.mutateAsync(offer.id);
    navigate("/mdl/offers");
  }, [deleteMutation, navigate, offer]);

  const actions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          className={topbarIconButtonClassName}
          disabled={saving}
          onClick={() => {
            handleSave();
          }}
          size="sm"
        >
          <Save className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>
            {saving ? t("saving") : t("save")}
          </TopbarActionLabel>
        </Button>
        <Button
          className={topbarIconButtonClassName}
          disabled={saving}
          onClick={handleMarkAsReady}
          size="sm"
          variant="outline"
        >
          <Check className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>{t("markAsReady")}</TopbarActionLabel>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("actionsMenu")}
              className={topbarIconButtonClassName}
              size="sm"
              variant="outline"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={saving} onClick={handleMarkAsReady}>
              <Check className="mr-2 h-4 w-4" />
              {t("markAsReady")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={saving || previewLoading}
              onClick={handlePreviewPdf}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t("previewPdf")}
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
              {t("settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [
      downloadingPdf,
      handleDownloadPdf,
      handleMarkAsReady,
      handlePreviewPdf,
      handleSave,
      openSettings,
      previewLoading,
      saving,
      t,
    ]
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

  useRegisterAgentUiSlice(
    "offers.edit",
    useMemo(
      () =>
        offer
          ? {
              selection: { entity_id: offer.id, entity_type: "offer" },
              page: {
                offer_id: offer.id,
                offer_status: offer.status,
                offer_number: offer.offer_number,
                offer_title: offer.title,
              },
            }
          : null,
      [offer]
    )
  );

  const totals = useMemo(
    () =>
      calculateTotals(blocks, offer?.default_tax_rate ?? tenantFallbackTaxRate),
    [blocks, offer?.default_tax_rate, tenantFallbackTaxRate]
  );
  const taxBreakdown = useMemo(() => buildTaxBreakdown(blocks), [blocks]);
  const placeholderContext = useMemo(() => {
    if (!offer) {
      return null;
    }
    const recipientAddress = [offer.recipient_address]
      .filter(Boolean)
      .join(", ");
    return buildPlaceholderContext({
      recipient: {
        company_name: offer.recipient_name ?? "",
        contact_name:
          entities.find((e) => e.id === offer.client_id)?.contact_name ?? null,
        email: offer.recipient_email ?? null,
        address_full: recipientAddress || null,
        vat_id: entities.find((e) => e.id === offer.client_id)?.vat_id ?? null,
      },
      offer: {
        title: offer.title ?? "",
        offer_number: offer.offer_number ?? "",
        reference: offer.reference ?? null,
        created_at: formatDate(offer.created_at),
        valid_until: formatDate(offer.valid_until),
      },
      totals: {
        subtotal: totals.net,
        subtotal_formatted: `${totals.net.toFixed(2)} ${offer.currency}`,
        total: totals.gross,
        total_formatted: `${totals.gross.toFixed(2)} ${offer.currency}`,
        taxAmount_formatted: `${totals.tax.toFixed(2)} ${offer.currency}`,
        currency: offer.currency,
      },
      sender: {
        company_name:
          companyProfile?.name ??
          companyProfile?.brand_name ??
          currentTenant?.name ??
          "",
        address_full:
          [
            companyProfile?.address_street,
            [
              companyProfile?.address_zip,
              companyProfile?.address_city,
              companyProfile?.address_country,
            ]
              .filter(Boolean)
              .join(", "),
          ]
            .filter(Boolean)
            .join(", ") || null,
        email: companyProfile?.email ?? null,
        phone: companyProfile?.phone ?? null,
        vat_id: companyProfile?.vat_id ?? null,
      },
    });
  }, [
    entities,
    companyProfile,
    currentTenant?.name,
    offer,
    totals.gross,
    totals.net,
    totals.tax,
  ]);
  const resolvedIntro = useMemo(() => {
    if (!(offer?.introduction && placeholderContext)) {
      return "";
    }
    return resolvePlaceholders(offer.introduction, placeholderContext);
  }, [offer?.introduction, placeholderContext]);
  const resolvedFinalNotes = useMemo(() => {
    if (!(offer?.final_notes && placeholderContext)) {
      return "";
    }
    return resolvePlaceholders(offer.final_notes, placeholderContext);
  }, [offer?.final_notes, placeholderContext]);

  const handleClientSelect = useCallback(
    async (clientId: string) => {
      if (!contactsPlugin) {
        return null;
      }
      const contact = await contactsPlugin.getContact(clientId);
      return formatContactSnapshot(contact);
    },
    [contactsPlugin]
  );

  const editorUnits = useMemo(
    () => normalizeCommercialUnits(commercialSettings?.units),
    [commercialSettings?.units]
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DocumentHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </DocumentHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="mx-auto w-full max-w-6xl space-y-4 p-page">
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-24 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    );
  }
  if (!offer) {
    return (
      <p className="p-page text-muted-foreground text-sm">{t("notFound")}</p>
    );
  }

  const clientName = offer.client_id
    ? entities.find((e) => e.id === offer.client_id)?.display_name
    : offer.recipient_name;
  const clientContactName = offer.client_id
    ? entities.find((e) => e.id === offer.client_id)?.contact_name
    : null;
  const isReadOnly = offer.status === "accepted";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DocumentHeader
        collapsed={headerCollapsed}
        compactStatus={<OfferStatusBadge status={offer.status} />}
        compactTitle={offer.title || t("offerTitle")}
      >
        <ClientTopline
          clientId={contactsPlugin ? offer.client_id : null}
          clientName={
            clientName ??
            (offer.status === "draft" && contactsPlugin
              ? t("noClientSelected")
              : undefined)
          }
          isReadOnly={isReadOnly}
          onChangeClient={openSettings}
          showChangeClient={!isReadOnly && offer.status === "draft"}
          showLinkToClient={Boolean(contactsPlugin)}
        />
        <DocumentTitle
          isReadOnly={isReadOnly}
          onBlur={() => {
            handleSave();
          }}
          onChange={(title) => setOffer({ ...offer, title })}
          placeholder={t("offerTitle")}
          value={offer.title}
        />
        <OfferStatusStepper status={offer.status} />
      </DocumentHeader>

      {externalChange && pageData ? (
        <div className="flex items-center justify-between gap-3 border-amber-500/40 border-b bg-amber-500/10 px-4 py-2 text-sm">
          <span>{t("externalChange")}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() =>
                adoptServerState(
                  pageData,
                  JSON.stringify({ b: pageData.blocks, o: pageData.offer })
                )
              }
              size="sm"
              variant="outline"
            >
              {t("externalChangeAdopt")}
            </Button>
            <Button
              onClick={() => {
                // Keep the local edits; remember the server revision so the
                // same emission doesn't re-flag. Saving overwrites it.
                adoptedRef.current.serverJson = JSON.stringify({
                  b: pageData.blocks,
                  o: pageData.offer,
                });
                setExternalChange(false);
              }}
              size="sm"
              variant="ghost"
            >
              {t("externalChangeKeep")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col bg-card/30">
        <div className="flex h-11 shrink-0 items-center">
          <div
            className={cn(
              "mx-auto flex w-full items-center justify-end px-page",
              contentMaxWidthClass
            )}
          >
            <DocSidebarToggle
              label={t("toggleOfferSettings")}
              storageKey={OFFER_DRAFT_DOC_SIDEBAR_KEY}
              text={t("settings")}
            />
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={onScroll}
          ref={scrollRef}
        >
          <DocSidebarLayout
            className={cn("gap-8 p-page", contentMaxWidthClass)}
            inlineMinWidth={1200}
            sidebar={
              <OfferSettingsPanel
                entities={entities}
                entitiesAvailable={Boolean(contactsPlugin)}
                offer={offer}
                onChange={(patch: Partial<OfferListItem>) => {
                  setOffer((current) =>
                    current ? { ...current, ...patch } : current
                  );
                  updateMutation.mutate(patch);
                }}
                onClientSelect={contactsPlugin ? handleClientSelect : undefined}
                onDelete={() => setDeleteConfirmOpen(true)}
                settingsTaxRates={normalizedEditorTaxRates}
              />
            }
            sidebarLabel={t("offerSettingsTitle")}
            storageKey={OFFER_DRAFT_DOC_SIDEBAR_KEY}
          >
            <section className="w-full space-y-4">
              <Card className="w-full bg-card">
                <CardContent className="space-y-5 p-6">
                  <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                    <div className="flex min-h-0 flex-col justify-end">
                      <OfferRecipientBlock
                        clientContactName={clientContactName}
                        clientId={contactsPlugin ? offer.client_id : null}
                        isReadOnly={isReadOnly}
                        offer={offer}
                        onChangeClient={openSettings}
                        showChangeClient={
                          !isReadOnly && offer.status === "draft"
                        }
                        showLinkToClient={Boolean(contactsPlugin)}
                      />
                    </div>
                    <OfferSenderBlock
                      companyProfile={companyProfile}
                      fallbackName={currentTenant?.name}
                    />
                  </div>

                  <OfferMetadataInline
                    disabled={isReadOnly}
                    offer={offer}
                    onChange={(patch) => {
                      setOffer((current) =>
                        current ? { ...current, ...patch } : current
                      );
                      updateMutation.mutate(patch);
                    }}
                  />

                  <DocumentTitleBlock
                    isReadOnly={isReadOnly}
                    onChange={(title) =>
                      setOffer((current) =>
                        current ? { ...current, title } : current
                      )
                    }
                    placeholder={t("offerTitle")}
                    value={offer.title}
                  />

                  <DocumentIntroductionBlock
                    content={offer.introduction ?? ""}
                    documentType="offer"
                    isEditing={editingIntro}
                    isReadOnly={isReadOnly}
                    onChange={(content) =>
                      setOffer((current) =>
                        current
                          ? {
                              ...current,
                              introduction:
                                stripHtmlTags(content).trim() === ""
                                  ? ""
                                  : content,
                            }
                          : current
                      )
                    }
                    onEditingChange={setEditingIntro}
                    resolvedContent={resolvedIntro}
                    showPlaceholderHelper={!isReadOnly}
                  />

                  <BlockEditor
                    blocks={blocks}
                    currency={offer.currency || "EUR"}
                    documentStatus={offer.status}
                    documentType="offer"
                    offerSettings={{
                      show_phase_index: offer.show_phase_index,
                      phase_index_pattern: offer.phase_index_pattern,
                      show_tax_per_item: offer.show_tax_per_item,
                      default_tax_rate: offer.default_tax_rate,
                      show_phase_totals: offer.show_phase_totals,
                    }}
                    onChange={setBlocks}
                    taxRates={normalizedEditorTaxRates}
                    units={editorUnits}
                  />

                  <CommercialBlockTotals
                    blocks={blocks as any}
                    currency={offer.currency ?? "EUR"}
                    defaultTaxRate={
                      offer.default_tax_rate ?? tenantFallbackTaxRate
                    }
                    documentType="offer"
                    hideWhenNoItems={false}
                    locale="de-DE"
                    phaseIndexPattern={offer.phase_index_pattern ?? "1."}
                    showPhaseIndex={offer.show_phase_index ?? true}
                    showPhaseTotals={
                      (offer.phases_enabled ?? false) &&
                      (offer.show_phase_totals ?? false)
                    }
                    showTaxPerItem={offer.show_tax_per_item ?? true}
                  />

                  <DocumentFinalNotesBlock
                    content={offer.final_notes ?? ""}
                    documentType="offer"
                    isEditing={editingFinalNotes}
                    isReadOnly={isReadOnly}
                    onChange={(content: string) =>
                      setOffer((current) =>
                        current
                          ? {
                              ...current,
                              final_notes:
                                stripHtmlTags(content).trim() === ""
                                  ? ""
                                  : content,
                            }
                          : current
                      )
                    }
                    onEditingChange={setEditingFinalNotes}
                    resolvedContent={resolvedFinalNotes}
                    showBorder={false}
                    showPlaceholderHelper={!isReadOnly}
                  />
                </CardContent>
              </Card>
            </section>
          </DocSidebarLayout>
        </div>
      </div>

      <PdfPreviewSheet
        blob={previewBlob}
        downloadLabel={t("downloadPdf")}
        fileName={`${offer.offer_number ?? "offer"}.pdf`}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        title={offer.title ?? t("previewPdf")}
      />

      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteOfferConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteOfferConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                handleDeleteConfirmed();
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
