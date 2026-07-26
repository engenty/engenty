import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageState } from "@/components/PageState";
import {
  allowListToStored,
  formatAllowList,
} from "@/features/entitlements/allow-list-input";
import { formatMicros } from "@/features/packages/package-format";
import {
  clearTenantOverride,
  type EntitlementEnforcementMode,
  setTenantOverride,
  setTenantPackage,
} from "@/lib/api/entitlements";
import { tenantEntitlementsQuery } from "@/lib/queries/entitlements";

const NONE = "__none__";

/**
 * Per-tenant entitlements: assign a commercial package, view the resolved
 * entitlements (package composed with the tenant override), and set a sparse
 * seat override. Mirrors the members/modules/flags tabs.
 */
export function TenantEntitlementsTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(
    tenantEntitlementsQuery(tenantId)
  );

  // Draft seat override, seeded from the current override once loaded.
  const [seatDraft, setSeatDraft] = useState<string>("");
  useEffect(() => {
    const current = data?.override?.appLimits?.maxUsers;
    setSeatDraft(current == null ? "" : String(current));
  }, [data?.override?.appLimits?.maxUsers]);

  // Draft AI override (allow-list + hard limit + enforcement), seeded from the
  // current override. Empty allow-list draft = clear the restriction (all
  // models). The resolved policy is written into `ai.tenant_usage_policy` with
  // `managed_by='entitlement'`, which the AI plane treats as read-only for the
  // tenant admin.
  const [allowDraft, setAllowDraft] = useState<string>("");
  const [providerDraft, setProviderDraft] = useState<string>("");
  const [aiLimitDraft, setAiLimitDraft] = useState<string>("");
  const [aiModeDraft, setAiModeDraft] =
    useState<EntitlementEnforcementMode>("observe");
  useEffect(() => {
    const ai = data?.override?.aiUsagePolicy;
    setAllowDraft(formatAllowList(ai?.allowed_models));
    setProviderDraft(formatAllowList(ai?.allowed_providers));
    setAiLimitDraft(
      ai?.hard_limit_cost_micros == null
        ? ""
        : String(ai.hard_limit_cost_micros / 1_000_000)
    );
    setAiModeDraft(
      ai?.enforcement_mode ??
        data?.resolved.aiUsagePolicy.enforcement_mode ??
        "observe"
    );
  }, [
    data?.override?.aiUsagePolicy,
    data?.resolved.aiUsagePolicy.enforcement_mode,
  ]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manage", "tenants", tenantId, "entitlements"],
    });

  // Every entitlement write re-materializes `ai.tenant_usage_policy`. That
  // propagation is non-transactional, so a success toast on its own would imply
  // enforcement changed when it may not have.
  const reportSync = (
    result: { policySyncError?: string; policySynced: boolean },
    ok: string
  ) => {
    if (result.policySynced) {
      toast.success(ok);
      return;
    }
    toast.error(t("entitlements.policySyncFailed"), {
      description: result.policySyncError,
    });
  };

  const assign = useMutation({
    mutationFn: (packageId: string | null) =>
      setTenantPackage(tenantId, packageId),
    onSuccess: async (result) => {
      reportSync(result, t("entitlements.packageSaved"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const saveSeats = useMutation({
    mutationFn: () => {
      const trimmed = seatDraft.trim();
      const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
      const base = data?.override ?? {};
      return setTenantOverride(tenantId, {
        ...base,
        appLimits: {
          ...base.appLimits,
          maxUsers: parsed,
          enforcement_mode:
            base.appLimits?.enforcement_mode ??
            data?.resolved.appLimits.enforcement_mode ??
            "observe",
        },
      });
    },
    onSuccess: async (result) => {
      reportSync(result, t("entitlements.overrideSaved"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const saveAi = useMutation({
    mutationFn: () => {
      const limitTrimmed = aiLimitDraft.trim();
      const dollars =
        limitTrimmed === "" ? null : Number.parseFloat(limitTrimmed);
      const hardMicros =
        dollars == null || !Number.isFinite(dollars) || dollars < 0
          ? null
          : Math.round(dollars * 1_000_000);
      const base = data?.override ?? {};
      return setTenantOverride(tenantId, {
        ...base,
        aiUsagePolicy: {
          ...base.aiUsagePolicy,
          allowed_models: allowListToStored(allowDraft),
          allowed_providers: allowListToStored(providerDraft),
          hard_limit_cost_micros: hardMicros,
          enforcement_mode: aiModeDraft,
        },
      });
    },
    onSuccess: async (result) => {
      reportSync(result, t("entitlements.overrideSaved"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const clearOverride = useMutation({
    mutationFn: () => clearTenantOverride(tenantId),
    onSuccess: async (result) => {
      reportSync(result, t("entitlements.overrideCleared"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  return (
    <div className="space-y-6 p-page">
      <PageState
        error={error}
        isLoading={isLoading}
        onRetry={() => void refetch()}
      >
        {data ? (
          <>
            {/* Package picker */}
            <section className="space-y-2">
              <h2 className="font-medium text-sm">
                {t("entitlements.packageLabel")}
              </h2>
              <div className="flex items-center gap-3">
                <Select
                  onValueChange={(value) =>
                    assign.mutate(value === NONE ? null : value)
                  }
                  value={data.packageId ?? NONE}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {t("entitlements.noPackage")}
                    </SelectItem>
                    {data.packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assign.isPending ? (
                  <span className="text-muted-foreground text-xs">
                    {t("common.saving")}
                  </span>
                ) : null}
              </div>
            </section>

            {/* Resolved summary */}
            <section className="space-y-2">
              <h2 className="font-medium text-sm">
                {t("entitlements.resolvedLabel")}
              </h2>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SummaryRow
                  label={t("entitlements.modules")}
                  value={
                    data.resolved.modules === null
                      ? t("packages.allModules")
                      : String(data.resolved.modules.length)
                  }
                />
                <SummaryRow
                  label={t("entitlements.seats")}
                  value={data.resolved.appLimits.maxUsers ?? "∞"}
                />
                <SummaryRow
                  label={t("entitlements.aiLimit")}
                  value={formatMicros(
                    data.resolved.aiUsagePolicy.hard_limit_cost_micros
                  )}
                />
                <SummaryRow
                  label={t("entitlements.enforcement")}
                  value={
                    <Badge
                      variant={
                        data.resolved.appLimits.enforcement_mode === "enforce"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {t(
                        `packages.mode.${data.resolved.appLimits.enforcement_mode}`
                      )}
                    </Badge>
                  }
                />
              </dl>
            </section>

            {/* Seat override */}
            <section className="space-y-2">
              <h2 className="font-medium text-sm">
                {t("entitlements.overrideLabel")}
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="seat-override"
                  >
                    {t("entitlements.maxUsers")}
                  </label>
                  <Input
                    className="w-40"
                    id="seat-override"
                    inputMode="numeric"
                    onChange={(e) => setSeatDraft(e.target.value)}
                    placeholder={t("entitlements.inherit")}
                    value={seatDraft}
                  />
                </div>
                <Button
                  disabled={saveSeats.isPending}
                  onClick={() => saveSeats.mutate()}
                  size="sm"
                >
                  {t("entitlements.saveOverride")}
                </Button>
                {data.override ? (
                  <Button
                    disabled={clearOverride.isPending}
                    onClick={() => clearOverride.mutate()}
                    size="sm"
                    variant="outline"
                  >
                    {t("entitlements.clearOverride")}
                  </Button>
                ) : null}
              </div>
            </section>

            {/* AI governance override — model allow-list + budget + enforcement.
                Written into ai.tenant_usage_policy as managed_by='entitlement'. */}
            <section className="space-y-2">
              <h2 className="font-medium text-sm">
                {t("entitlements.aiOverrideLabel")}
              </h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="ai-allowlist"
                  >
                    {t("entitlements.aiAllowList")}
                  </label>
                  <Input
                    id="ai-allowlist"
                    onChange={(e) => setAllowDraft(e.target.value)}
                    placeholder="openai/gpt-5-mini, anthropic/claude-sonnet-5"
                    value={allowDraft}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("entitlements.aiAllowListHint")}
                  </p>
                </div>
                <div className="space-y-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="ai-providerlist"
                  >
                    {t("entitlements.aiProviderList")}
                  </label>
                  <Input
                    id="ai-providerlist"
                    onChange={(e) => setProviderDraft(e.target.value)}
                    placeholder="anthropic, openai"
                    value={providerDraft}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("entitlements.aiProviderListHint")}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="ai-hard-limit"
                    >
                      {t("entitlements.aiHardLimit")}
                    </label>
                    <Input
                      className="w-40"
                      id="ai-hard-limit"
                      inputMode="decimal"
                      onChange={(e) => setAiLimitDraft(e.target.value)}
                      placeholder={t("entitlements.inherit")}
                      value={aiLimitDraft}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="ai-mode"
                    >
                      {t("entitlements.enforcement")}
                    </label>
                    <Select
                      onValueChange={(value) =>
                        setAiModeDraft(value as EntitlementEnforcementMode)
                      }
                      value={aiModeDraft}
                    >
                      <SelectTrigger className="w-40" id="ai-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="observe">
                          {t("packages.mode.observe")}
                        </SelectItem>
                        <SelectItem value="enforce">
                          {t("packages.mode.enforce")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={saveAi.isPending}
                    onClick={() => saveAi.mutate()}
                    size="sm"
                  >
                    {t("entitlements.aiSaveOverride")}
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </PageState>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-medium text-sm">{value}</dd>
    </div>
  );
}
