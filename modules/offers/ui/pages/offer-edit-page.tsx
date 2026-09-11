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
import {
  normalizeCommercialUnits,
  resolveBuiltInUnits,
} from "@engenty/commercial-settings/ui";
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
import { MoreVertical, Save, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { OfferBlock, OfferBlockType, OfferListItem } from "../api.js";
import { downloadOfferPdf } from "../api.js";
import { ClientTopline } from "../components/client-topline.js";
import { DocumentHeader } from "../components/document-header.js";
import { DocumentTitle } from "../components/document-title.js";
import { OfferDraftToolbar } from "../components/offer-draft-toolbar.js";
import { OfferMetadataInline } from "../components/offer-metadata-inline.js";
import { OfferRecipientBlock } from "../components/offer-recipient-block.js";
import { OfferSenderBlock } from "../components/offer-sender-block.js";
import { OfferSettingsPanel } from "../components/offer-settings-panel.js";
import {
  ChangeClientDialog,
  type OfferEntityListItem,
} from "../components/offer-settings-sections.js";
import { OfferStatusBadge } from "../components/offer-status-badge.js";
import { OfferStatusStepper } from "../components/offer-status-stepper.js";
import { useOffersEditAgentUiSlice } from "../hooks/use-offers-agent-ui-slice.js";
import { useOffersModuleSecondaryShellNav } from "../hooks/use-offers-module-secondary-shell-nav.js";
import {
  normalizeCommercialTaxRates,
  resolveDefaultTaxRateFromCommercial,
} from "../lib/commercial-tax-rates.js";
import {
  formatContactSnapshot,
  formatEntityRecipientSnapshot,
} from "../lib/contact-snapshot.js";
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

/**
 * The offer draft editor, as a page or embedded in a host pane.
 *
 * `embedded` matches `OfferDetailPage`'s: ids as props, no module secondary
 * nav, no `DocumentHeader`, and no status redirect — the host owns the URL, so
 * navigating would eject the reader from the pane. The editing itself, the
 * external-change banner and the save path are unchanged; this IS the draft
 * editor, not a read-only rendering of one.
 */
export function OfferEditPage(props?: {
  embedded?: boolean;
  offerId?: string;
}) {
  const embedded = props?.embedded ?? false;
  const { t } = useTranslation("offers");
  const { t: tCommercial, i18n } = useTranslation("commercial-settings");
  const { currentTenant } = useWorkspaceContext();
  const navigate = useNavigate();
  const routeParams = useParams<{ id: string }>();
  const id = props?.offerId ?? routeParams.id;
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
  // Cap the document+sidebar row: wider when the sidebar occupies an inline
  // column, reading width when closed/overlay.
  const settingsInlineOpen =
    settingsSidebar.mode === "inline" && settingsSidebarOpen;
  const contentMaxWidthClass = settingsInlineOpen ? "max-w-8xl" : "max-w-6xl";
  const {
    collapsed: headerCollapsed,
    onScroll,
    scrollRef,
  } = useScrollCollapse();
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingFinalNotes, setEditingFinalNotes] = useState(false);
  const [changeClientOpen, setChangeClientOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("__none__");
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
  // Settings / metadata auto-save writes the offer then invalidates the edit
  // query (and realtime may invalidate again). Those echoes must not surface
  // as "changed outside the editor".
  const ownOfferWriteCountRef = useRef(0);
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

  /** Optimistic local patch + persist; marks the write as our own for conflict detection. */
  const patchOfferFields = useCallback(
    (patch: Partial<OfferListItem>) => {
      ownOfferWriteCountRef.current += 1;
      setOffer((current) => (current ? { ...current, ...patch } : current));
      updateMutation.mutate(patch, {
        onError: () => {
          ownOfferWriteCountRef.current = Math.max(
            0,
            ownOfferWriteCountRef.current - 1
          );
        },
      });
    },
    [updateMutation]
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
    if (ownOfferWriteCountRef.current > 0) {
      // One refetch can cover several rapid auto-saves; clear rather than
      // decrement so a leftover count cannot swallow a later real conflict.
      ownOfferWriteCountRef.current = 0;
      // Acknowledge our auto-save echo without clobbering unsaved block edits.
      adoptedRef.current = {
        blocks: adoptedRef.current.blocks,
        offer,
        serverJson,
      };
      setExternalChange(false);
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
    // Embedded, the host chose this editor from the record's phase and owns the
    // URL; navigating on a status change would eject the reader from the pane.
    if (!embedded && offer.status !== "draft") {
      navigate(`/mdl/offers/${offer.id}`, { replace: true });
    }
  }, [embedded, offer, navigate]);

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
    [handleSave, openSettings, saving, t]
  );

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    // Embedded: the host owns the secondary column, and there is no
    // DocumentHeader for a transparent topbar to blend into or float over.
    ...(embedded
      ? {}
      : {
          secondaryNavAfterItems,
          secondaryNavHeaderSlot,
          // Float the transparent topbar over the white DocumentHeader.
          topbarOverlap: true,
        }),
  });

  useOffersEditAgentUiSlice(offer);

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

  const openChangeClientDialog = useCallback(() => {
    setSelectedClientId(offer?.client_id ?? "__none__");
    setChangeClientOpen(true);
  }, [offer?.client_id]);

  const handleClientChange = useCallback(
    async (value: string) => {
      const clientId = value === "__none__" ? null : value;
      if (clientId) {
        const snapshot = await handleClientSelect(clientId);
        if (snapshot) {
          patchOfferFields({
            client_id: clientId,
            recipient_name: snapshot.recipient_name,
            recipient_address: snapshot.recipient_address,
            recipient_email: snapshot.recipient_email,
          });
          return;
        }
      }
      patchOfferFields({ client_id: clientId });
    },
    [handleClientSelect, patchOfferFields]
  );

  const handleRefreshClientSnapshot = useCallback(async () => {
    if (!offer?.client_id) {
      return;
    }
    const snapshot = await handleClientSelect(offer.client_id);
    if (!snapshot) {
      return;
    }
    patchOfferFields({
      recipient_name: snapshot.recipient_name,
      recipient_address: snapshot.recipient_address,
      recipient_email: snapshot.recipient_email,
    });
  }, [handleClientSelect, offer?.client_id, patchOfferFields]);

  useEffect(() => {
    if (!changeClientOpen) {
      return;
    }
    setSelectedClientId(offer?.client_id ?? "__none__");
  }, [changeClientOpen, offer?.client_id]);

  // Backfill an empty recipient snapshot from the linked contact so the
  // editor (and PDF) match what the settings panel already shows live.
  const recipientHydrateRef = useRef<string | null>(null);
  useEffect(() => {
    recipientHydrateRef.current = null;
  }, [id]);
  useEffect(() => {
    if (!(offer?.client_id && offer.id)) {
      return;
    }
    if (offer.recipient_name?.trim()) {
      return;
    }
    if (recipientHydrateRef.current === offer.id) {
      return;
    }
    const entity = entities.find((e) => e.id === offer.client_id);
    if (!entity?.display_name?.trim()) {
      return;
    }
    const snapshot = formatEntityRecipientSnapshot(entity);
    if (!snapshot.recipient_name) {
      return;
    }
    recipientHydrateRef.current = offer.id;
    patchOfferFields({
      recipient_name: snapshot.recipient_name,
      recipient_address: offer.recipient_address?.trim()
        ? offer.recipient_address
        : snapshot.recipient_address || null,
      recipient_email: offer.recipient_email?.trim()
        ? offer.recipient_email
        : snapshot.recipient_email || null,
    });
  }, [entities, offer, patchOfferFields]);

  const editorUnits = useMemo(
    () =>
      normalizeCommercialUnits(
        commercialSettings?.units,
        resolveBuiltInUnits(tCommercial)
      ),
    [commercialSettings?.units, i18n.language, tCommercial]
  );

  const linkedContact = useMemo(() => {
    if (!offer?.client_id) {
      return null;
    }
    const entity = entities.find((e) => e.id === offer.client_id);
    if (!entity) {
      return null;
    }
    const snapshot = formatEntityRecipientSnapshot(entity);
    return {
      name: snapshot.recipient_name || null,
      address: snapshot.recipient_address || null,
      email: snapshot.recipient_email || null,
    };
  }, [entities, offer?.client_id]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {embedded ? null : (
          <DocumentHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          </DocumentHeader>
        )}
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
      {embedded ? null : (
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
            onChangeClient={openChangeClientDialog}
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
      )}

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

      <OfferDraftToolbar
        contentClassName={contentMaxWidthClass}
        downloadingPdf={downloadingPdf}
        end={
          <DocSidebarToggle
            label={t("toggleOfferSettings")}
            storageKey={OFFER_DRAFT_DOC_SIDEBAR_KEY}
            text={t("settings")}
          />
        }
        onDownloadPdf={handleDownloadPdf}
        onMarkAsReady={handleMarkAsReady}
        onPreviewPdf={handlePreviewPdf}
        previewLoading={previewLoading}
        saving={saving}
      />

      <div className="flex min-h-0 flex-1 flex-col bg-card/30">
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
              <OfferSettingsPanel
                entities={entities as OfferEntityListItem[]}
                entitiesAvailable={Boolean(contactsPlugin)}
                offer={offer}
                onChange={patchOfferFields}
                onDelete={() => setDeleteConfirmOpen(true)}
                onOpenClientDialog={openChangeClientDialog}
                onRefreshClientSnapshot={handleRefreshClientSnapshot}
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
                        linkedContact={linkedContact}
                        offer={offer}
                        onChangeClient={openChangeClientDialog}
                        onRefreshClient={
                          contactsPlugin && offer.client_id
                            ? handleRefreshClientSnapshot
                            : undefined
                        }
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
                    onChange={patchOfferFields}
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

      {contactsPlugin ? (
        <ChangeClientDialog
          ContactChooser={contactsPlugin.ContactChooser ?? null}
          entities={entities as OfferEntityListItem[]}
          onOpenChange={setChangeClientOpen}
          onSave={() => {
            void handleClientChange(selectedClientId);
            setChangeClientOpen(false);
          }}
          onSelectedClientIdChange={setSelectedClientId}
          open={changeClientOpen}
          selectedClientId={selectedClientId}
          t={t}
        />
      ) : null}

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
