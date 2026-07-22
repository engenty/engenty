import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DetailPageHeader,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { RotateCcw, RotateCcwSquare, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentsOverridesTab } from "../features/ai-settings/agents-overrides-tab";
import { DocConverterSettingsCard } from "../features/ai-settings/doc-converter-settings-card";
import { LimitsBudgetsTab } from "../features/ai-settings/limits-budgets-tab";
import {
  mapGatewayModelSelectOptions,
  mergeSelectedGatewayModelOptions,
} from "../features/ai-settings/map-gateway-model-select-options";
import { ModelMatrixCard } from "../features/ai-settings/model-matrix-card";
import { RealtimeVoiceCard } from "../features/ai-settings/realtime-voice-card";
import { UsageReportTab } from "../features/ai-settings/usage-report-tab";
import { useAiSettings } from "../hooks/use-ai-settings";
import {
  useDocConverterAvailabilityQuery,
  useEffectiveAiSettingsQuery,
  useGatewayModelOptionsQuery,
  useTenantUsagePolicyQuery,
} from "../lib/admin/ai-settings-queries";
import type { GatewayModelPriceTier } from "../lib/admin/gateway-model-options-api";

const DEFAULT_TAB = "copilot";
const VALID_TABS = new Set([
  DEFAULT_TAB,
  "limits",
  "agents",
  "voice",
  "usage",
  "doc-converter",
]);
const PRICE_TIERS: Array<"all" | GatewayModelPriceTier> = [
  "all",
  "cheap",
  "low",
  "medium",
  "high",
  "expensive",
];

export function AiGeneralSettingsPage() {
  const { t } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(tCommon("navigation.settings"));
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    loading,
    settings,
    hasChanges,
    saving,
    saveError,
    handleReset,
    handleResetToDefaults,
    handleSave,
    updateSettings,
  } = useAiSettings();
  const availabilityQuery = useDocConverterAvailabilityQuery();
  const effectiveQuery = useEffectiveAiSettingsQuery();
  const usagePolicyQuery = useTenantUsagePolicyQuery();
  // Governance: a plan-governed tenant may still PICK models, but only within
  // its allow-list. The picker options are filtered server-side; this note tells
  // the admin why the catalog is smaller. Budgets (limits tab) are read-only.
  const allowListActive =
    (usagePolicyQuery.data?.allowed_models?.length ?? 0) > 0;
  const [maxPriceTier, setMaxPriceTier] = useState<
    "all" | GatewayModelPriceTier
  >("medium");
  // Fetch the full catalog (all tiers); the price-tier selector filters the
  // picker client-side, so an effective/pinned model outside the tier still
  // resolves its pricing + capabilities in the matrix.
  const chatModelOptionsQuery = useGatewayModelOptionsQuery({
    availability_purpose: "chat",
    use_case: "text",
  });
  const routingModelOptionsQuery = useGatewayModelOptionsQuery({
    availability_purpose: "routing",
    use_case: "text",
  });
  const chatModels = chatModelOptionsQuery.data?.items ?? [];
  const routingModels = routingModelOptionsQuery.data?.items ?? [];
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam && VALID_TABS.has(tabParam) ? tabParam : DEFAULT_TAB;
  const chatModelOptions = useMemo(
    () =>
      mergeSelectedGatewayModelOptions(
        mapGatewayModelSelectOptions(
          chatModelOptionsQuery.data?.items ?? [],
          t
        ),
        [
          settings.chat_model_id,
          settings.research_model_id,
          settings.planning_coding_model_id,
          settings.safeguard_model_id,
        ],
        t("fields.modelUnavailable")
      ),
    [
      chatModelOptionsQuery.data?.items,
      settings.chat_model_id,
      settings.research_model_id,
      settings.planning_coding_model_id,
      settings.safeguard_model_id,
      t,
    ]
  );
  const catalogEmpty =
    !(
      chatModelOptionsQuery.isLoading ||
      routingModelOptionsQuery.isLoading ||
      chatModelOptionsQuery.isError ||
      routingModelOptionsQuery.isError
    ) && (chatModelOptionsQuery.data?.items.length ?? 0) === 0;
  const catalogLoadError =
    chatModelOptionsQuery.isError || routingModelOptionsQuery.isError;
  const handleTabChange = (nextTab: string) => {
    if (!VALID_TABS.has(nextTab) || nextTab === activeTab) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (nextTab === DEFAULT_TAB) {
      next.delete("tab");
    } else {
      next.set("tab", nextTab);
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  };

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: tCommon("settings.aiModels.menuLabel") },
    ],
    [moduleRootCrumb, tCommon]
  );

  const pageActions = useMemo(
    () =>
      loading ? null : (
        <div className="flex gap-2">
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={handleResetToDefaults}
            size="sm"
            variant="ghost"
          >
            <RotateCcwSquare className="h-3.5 w-3.5" />
            {t("actions.resetToDefaults")}
          </Button>
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={!hasChanges}
            onClick={handleReset}
            size="sm"
            variant="outline"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("actions.reset")}
          </Button>
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={saving || !hasChanges}
            onClick={() => void handleSave()}
            size="sm"
            variant={hasChanges ? "default" : "outline"}
          >
            {saving ? (
              <AnimatedLoaderIcon play="always" size="xs" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      ),
    [
      handleReset,
      handleResetToDefaults,
      handleSave,
      saving,
      t,
      hasChanges,
      loading,
    ]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend into
    // one continuous surface (matches the memory / contact detail pages).
    topbarOverlap: true,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-page">
          <p className="text-muted-foreground text-sm">{t("page.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <DetailPageHeader
          belowStrip={
            <TabsList
              className="-mb-px w-fit border-0 bg-transparent p-0"
              variant="line"
            >
              <TabsTrigger value="copilot">{t("sections.models")}</TabsTrigger>
              <TabsTrigger value="limits">{t("sections.limits")}</TabsTrigger>
              <TabsTrigger value="agents">{t("sections.agents")}</TabsTrigger>
              <TabsTrigger value="voice">{t("sections.voice")}</TabsTrigger>
              <TabsTrigger value="usage">{t("sections.usage")}</TabsTrigger>
              <TabsTrigger value="doc-converter">
                {t("sections.docConverter")}
              </TabsTrigger>
            </TabsList>
          }
          description={
            <p className="text-muted-foreground text-sm">
              {t("page.description")}
            </p>
          }
          maxWidth="7xl"
          title={t("page.title")}
        />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            {saveError &&
            (activeTab === "copilot" ||
              activeTab === "limits" ||
              activeTab === "voice" ||
              activeTab === "doc-converter") ? (
              <div
                className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
                role="alert"
              >
                {saveError}
              </div>
            ) : null}

            {catalogLoadError ? (
              <div
                className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
                role="alert"
              >
                {t("sections.modelCatalogLoadError")}
              </div>
            ) : null}

            {catalogEmpty ? (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-950 text-sm dark:text-amber-100"
                role="status"
              >
                {t("sections.modelCatalogEmpty")}
              </div>
            ) : null}

            {activeTab === "copilot" ? (
              <div className="flex items-center gap-2 text-sm">
                <Label htmlFor="ai-settings-max-price-tier">
                  {t("fields.maxPriceTier")}
                </Label>
                <select
                  aria-label={t("fields.maxPriceTier")}
                  className="h-8 rounded-sm border bg-background px-2 text-sm"
                  id="ai-settings-max-price-tier"
                  onChange={(event) =>
                    setMaxPriceTier(
                      event.target.value as "all" | GatewayModelPriceTier
                    )
                  }
                  value={maxPriceTier}
                >
                  {PRICE_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {t(`fields.priceTier.${tier}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <TabsContent className="space-y-6" value="copilot">
              {allowListActive ? (
                <div
                  className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-muted-foreground text-xs"
                  role="status"
                >
                  {t("matrix.allowlistNote")}
                </div>
              ) : null}
              <ModelMatrixCard
                chatModels={chatModels}
                effective={effectiveQuery.data}
                maxPriceTier={maxPriceTier}
                routingModels={routingModels}
                settings={settings}
                t={t}
                updateSettings={updateSettings}
              />
            </TabsContent>

            <TabsContent className="space-y-6" value="limits">
              <LimitsBudgetsTab
                effective={effectiveQuery.data}
                settings={settings}
                t={t}
                updateSettings={updateSettings}
              />
            </TabsContent>

            <TabsContent className="space-y-6" value="agents">
              <AgentsOverridesTab
                chatModelOptions={chatModelOptions}
                effective={effectiveQuery.data}
                t={t}
              />
            </TabsContent>

            <TabsContent className="space-y-6" value="voice">
              <RealtimeVoiceCard
                settings={settings}
                t={t}
                updateSettings={updateSettings}
              />
            </TabsContent>

            <TabsContent className="space-y-6" value="usage">
              <UsageReportTab />
            </TabsContent>

            <TabsContent className="space-y-6" value="doc-converter">
              <DocConverterSettingsCard
                availability={availabilityQuery.data}
                availabilityLoading={availabilityQuery.isLoading}
                settings={settings}
                t={t}
                updateSettings={updateSettings}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

export const AiSettingsPage = AiGeneralSettingsPage;
