import type { JsonPatchOperation, JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  createFrontendToolDefinition,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
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
  Button,
  Card,
  CardContent,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Check, FileText, Save, Settings } from "lucide-react";
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
import { OfferStatusStepper } from "../components/offer-status-stepper.js";
import {
  normalizeCommercialTaxRates,
  resolveDefaultTaxRateFromCommercial,
} from "../lib/commercial-tax-rates.js";
import { formatContactSnapshot } from "../lib/contact-snapshot.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useDeleteOfferMutation,
  useOfferEditContactsQuery,
  useOfferEditPageQuery,
  useReplaceOfferBlocksMutation,
  useUpdateOfferMutation,
} from "../queries.js";

const OFFER_DRAFT_ALLOWED_PATHS = [
  "title",
  "billing_type",
  "billing_interval",
  "offer_date",
  "valid_until",
  "reference",
  "currency",
  "default_tax_rate",
  "no_tax_reason",
  "introduction",
  "final_notes",
  "phases_enabled",
  "show_phase_index",
  "show_phase_totals",
  "show_tax_per_item",
] as const satisfies Array<keyof OfferListItem>;

const OFFERS_APPLY_DRAFT_PATCH_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Apply JSON Patch ops to the current offer draft (title, billing type, dates, reference, etc). Browser-only; user saves explicitly.",
  name: "offers_apply_draft_patch",
  owner_module_id: "offers",
  parameters: {
    additionalProperties: false,
    properties: {
      patch: { items: { type: "object" }, type: "array" },
    },
    required: ["patch"],
    type: "object",
  },
  safety: "requires_confirmation",
  title: "Apply Offer Draft Patch",
});

const OFFERS_APPLY_BLOCKS_PATCH_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Replace the blocks of the current offer draft with a new array. Browser-only; user saves explicitly.",
  name: "offers_apply_blocks_patch",
  owner_module_id: "offers",
  parameters: {
    additionalProperties: false,
    properties: {
      blocks: { items: { type: "object" }, type: "array" },
    },
    required: ["blocks"],
    type: "object",
  },
  safety: "requires_confirmation",
  title: "Apply Offer Blocks Patch",
});

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useEffect(() => {
    initialSyncedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!pageData || initialSyncedRef.current) {
      return;
    }
    initialSyncedRef.current = true;
    setOffer(pageData.offer);
    setBlocks(toCommercialBlocks(pageData.blocks));
    setCompanyProfile(pageData.companyProfile);
    setCommercialSettings(pageData.commercialSettings);
  }, [pageData]);

  useEffect(() => {
    if (!offer) {
      return;
    }
    if (offer.status !== "draft") {
      navigate(`/mdl/offers/${offer.id}`, { replace: true });
    }
  }, [offer, navigate]);

  const breadcrumbs = useMemo(
    () => [
      { label: t("menu.offers"), to: "/mdl/offers" },
      {
        label: offer?.title ?? t("draft"),
        to: id ? `/mdl/offers/${id}` : "/mdl/offers",
      },
      { label: t("draft") },
    ],
    [id, offer?.title, t]
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
        <Button
          className={topbarIconButtonClassName}
          disabled={saving || previewLoading}
          onClick={handlePreviewPdf}
          size="sm"
          variant="outline"
        >
          <FileText className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>
            {previewLoading ? t("saving") : t("previewPdf")}
          </TopbarActionLabel>
        </Button>
        <Button
          className={topbarIconButtonClassName}
          onClick={() => setSettingsOpen(true)}
          size="sm"
          variant="outline"
        >
          <Settings className="mr-1.5 h-4 w-4" />
          <TopbarActionLabel>{t("settings")}</TopbarActionLabel>
        </Button>
      </div>
    ),
    [handleMarkAsReady, handlePreviewPdf, handleSave, previewLoading, saving, t]
  );
  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
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

  useEngentyFrontendTool(
    OFFERS_APPLY_DRAFT_PATCH_TOOL,
    useCallback(
      (input): JsonValue => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? input
            : {};
        const patch = Array.isArray(record.patch)
          ? (record.patch as JsonPatchOperation[])
          : [];
        if (patch.length === 0) {
          throw new Error("patch must contain at least one operation.");
        }
        for (const op of patch) {
          const field = op.path.replace(/^\//, "") as keyof OfferListItem;
          if (
            !OFFER_DRAFT_ALLOWED_PATHS.includes(
              field as (typeof OFFER_DRAFT_ALLOWED_PATHS)[number]
            )
          ) {
            throw new Error(`Unsupported offer draft path: ${op.path}`);
          }
          setOffer((current) =>
            current
              ? {
                  ...current,
                  [field]:
                    op.op === "remove"
                      ? null
                      : (op as { value: unknown }).value,
                }
              : current
          );
        }
        return { ok: true };
      },
      [setOffer]
    )
  );

  useEngentyFrontendTool(
    OFFERS_APPLY_BLOCKS_PATCH_TOOL,
    useCallback(
      (input): JsonValue => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? input
            : {};
        const rawBlocks = Array.isArray(record.blocks) ? record.blocks : [];
        // Agents send the operation/skill shape ({type, content_json,
        // order_index, id?}); the editor works on CommercialBlock ({content},
        // id required). Storing the raw payload verbatim renders blank blocks
        // — normalize instead.
        const newBlocks: CommercialBlock[] = rawBlocks
          .filter(
            (raw): raw is Record<string, unknown> =>
              Boolean(raw) && typeof raw === "object" && !Array.isArray(raw)
          )
          .map((raw, index) => ({
            id:
              typeof raw.id === "string" && raw.id.trim()
                ? raw.id
                : crypto.randomUUID(),
            type: typeof raw.type === "string" ? raw.type : "text",
            content: (raw.content_json ??
              raw.content ??
              {}) as CommercialBlock["content"],
            order_index:
              typeof raw.order_index === "number" ? raw.order_index : index,
          }));
        setBlocks(newBlocks);
        return { ok: true, blocks_applied: newBlocks.length };
      },
      [setBlocks]
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
      <DocumentHeader>
        <ClientTopline
          clientId={contactsPlugin ? offer.client_id : null}
          clientName={
            clientName ??
            (offer.status === "draft" && contactsPlugin
              ? t("noClientSelected")
              : undefined)
          }
          isReadOnly={isReadOnly}
          onChangeClient={() => setSettingsOpen(true)}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="mx-auto w-full max-w-6xl space-y-4 bg-card/30 p-page">
          <Card className="w-full bg-card">
            <CardContent className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                <div className="flex min-h-0 flex-col justify-end">
                  <OfferRecipientBlock
                    clientContactName={clientContactName}
                    clientId={contactsPlugin ? offer.client_id : null}
                    isReadOnly={isReadOnly}
                    offer={offer}
                    onChangeClient={() => setSettingsOpen(true)}
                    showChangeClient={!isReadOnly && offer.status === "draft"}
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
                            stripHtmlTags(content).trim() === "" ? "" : content,
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
                defaultTaxRate={offer.default_tax_rate ?? tenantFallbackTaxRate}
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
                            stripHtmlTags(content).trim() === "" ? "" : content,
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
      </div>

      <OfferSettingsPanel
        entities={entities}
        entitiesAvailable={Boolean(contactsPlugin)}
        offer={offer}
        onChange={(patch: Partial<OfferListItem>) => {
          setOffer((current) => (current ? { ...current, ...patch } : current));
          updateMutation.mutate(patch);
        }}
        onClientSelect={contactsPlugin ? handleClientSelect : undefined}
        onDelete={async () => {
          await deleteMutation.mutateAsync(offer.id);
          navigate("/mdl/offers");
        }}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        settingsTaxRates={normalizedEditorTaxRates}
      />

      <PdfPreviewSheet
        blob={previewBlob}
        downloadLabel={t("downloadPdf")}
        fileName={`${offer.offer_number ?? "offer"}.pdf`}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        title={offer.title ?? t("previewPdf")}
      />
    </div>
  );
}
