// AI usage report — read-only consumption totals + per-model / per-user
// breakdowns, plus the billing-period editor. Merged in from the former
// standalone /settings/ai-usage page as a tab of the AI settings page. Uses the
// `common` i18n namespace (settings.aiUsage.*), which is where these strings
// have always lived.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import {
  useAiUsageMeQuery,
  useAiUsageTenantQuery,
  useSaveTenantUsagePolicyMutation,
  useTenantUsagePolicyQuery,
} from "../../lib/admin/ai-settings-queries";
import type { TenantUsagePolicy } from "../../lib/admin/usage-policy-api";
import type {
  AiUsageBreakdownByUserRow,
  AiUsageMeResponse,
} from "../../lib/admin/usage-report-api";

const MICROS_PER_DOLLAR = 1_000_000;

function formatCostMicros(value: number | null | undefined, currency: string) {
  if (value == null) {
    return "—";
  }
  const dollars = value / MICROS_PER_DOLLAR;
  const fractionDigits = dollars < 1 ? 4 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(dollars);
}

function formatTokens(value: number | null | undefined) {
  if (value == null || value === 0) {
    return "0";
  }
  return new Intl.NumberFormat().format(value);
}

function formatRange(period: AiUsageMeResponse | undefined) {
  if (!period) {
    return "—";
  }
  const start = new Date(period.period_start).toLocaleDateString();
  const end = new Date(period.period_end).toLocaleDateString();
  return `${start} → ${end}`;
}

function aiUsagePerUserLabel(
  row: AiUsageBreakdownByUserRow,
  noUserLabel: string
): string {
  if (!row.user_id) {
    return noUserLabel;
  }
  const name = row.user_display_name?.trim();
  if (name) {
    return name;
  }
  const email = row.user_email?.trim();
  if (email) {
    return email;
  }
  return row.user_id;
}

export function UsageReportTab() {
  const { t } = useTranslation("common");
  const meQuery = useAiUsageMeQuery();
  const tenantQuery = useAiUsageTenantQuery(true);
  const policyQuery = useTenantUsagePolicyQuery();
  const updatePolicy = useSaveTenantUsagePolicyMutation();
  const me = meQuery.data;
  const policy = policyQuery.data;
  const tenant = tenantQuery.data;

  const [periodMode, setPeriodMode] =
    useState<TenantUsagePolicy["period_mode"]>("calendar");
  const [periodUnit, setPeriodUnit] =
    useState<TenantUsagePolicy["period_unit"]>("month");

  useEffect(() => {
    if (policy) {
      setPeriodMode(policy.period_mode);
      setPeriodUnit(policy.period_unit);
    }
  }, [policy]);

  const usageProgress = useMemo(() => {
    if (!me?.hard_limit_cost_micros) {
      return null;
    }
    const used = me.tenant_totals?.cost_micros ?? 0;
    return Math.min(100, Math.round((used / me.hard_limit_cost_micros) * 100));
  }, [me]);

  const currency = me?.currency ?? "usd";

  const policyDirty =
    policy &&
    (policy.period_mode !== periodMode || policy.period_unit !== periodUnit);

  const handleSavePolicy = () => {
    updatePolicy.mutate({
      period_mode: periodMode,
      period_unit: periodUnit,
    });
  };

  const isLoading = meQuery.isLoading && !meQuery.data;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.aiUsage.loading")}
        </p>
      ) : (
        <SettingsFormSection
          description={t("settings.aiUsage.periodDescription")}
          title={t("settings.aiUsage.title")}
        >
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t("settings.aiUsage.currentPeriod")}: {formatRange(me)}
            </p>
            <div className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("settings.aiUsage.cost")}
                </p>
                <p className="font-medium">
                  {formatCostMicros(
                    me?.tenant_totals?.cost_micros ?? 0,
                    currency
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("settings.aiUsage.inputTokens")}
                </p>
                <p className="font-medium">
                  {formatTokens(me?.tenant_totals?.input_tokens ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("settings.aiUsage.outputTokens")}
                </p>
                <p className="font-medium">
                  {formatTokens(me?.tenant_totals?.output_tokens ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("settings.aiUsage.requests")}
                </p>
                <p className="font-medium">
                  {formatTokens(me?.tenant_totals?.event_count ?? 0)}
                </p>
              </div>
            </div>
            {usageProgress != null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("settings.aiUsage.hardLimit")}
                  </span>
                  <span>
                    {formatCostMicros(
                      me?.tenant_totals?.cost_micros ?? 0,
                      currency
                    )}
                    {" / "}
                    {formatCostMicros(
                      me?.hard_limit_cost_micros ?? null,
                      currency
                    )}
                  </span>
                </div>
                <Progress value={usageProgress} />
              </div>
            )}
            {me?.soft_limit_cost_micros != null &&
              me.tenant_totals != null &&
              me.tenant_totals.cost_micros >= me.soft_limit_cost_micros && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200">
                  {t("settings.aiUsage.softLimitReached")}
                </div>
              )}
            {me?.enforcement_mode === "enforce" &&
              me.remaining_cost_micros === 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                  {t("settings.aiUsage.hardLimitReached")}
                </div>
              )}
          </div>
        </SettingsFormSection>
      )}

      <SettingsFormSection
        description={t("settings.aiUsage.periodSettingsDescription")}
        title={t("settings.aiUsage.periodSettingsTitle")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {t("settings.aiUsage.periodMode")}
            </p>
            <Select
              onValueChange={(v) =>
                setPeriodMode(v as TenantUsagePolicy["period_mode"])
              }
              value={periodMode}
            >
              <SelectTrigger>
                <SelectValue>
                  {periodMode === "calendar"
                    ? t("settings.aiUsage.periodCalendar")
                    : t("settings.aiUsage.periodRolling")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar">
                  {t("settings.aiUsage.periodCalendar")}
                </SelectItem>
                <SelectItem value="rolling">
                  {t("settings.aiUsage.periodRolling")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {t("settings.aiUsage.periodUnit")}
            </p>
            <Select
              onValueChange={(v) =>
                setPeriodUnit(v as TenantUsagePolicy["period_unit"])
              }
              value={periodUnit}
            >
              <SelectTrigger>
                <SelectValue>
                  {periodUnit === "day"
                    ? t("settings.aiUsage.unitDay")
                    : periodUnit === "week"
                      ? t("settings.aiUsage.unitWeek")
                      : t("settings.aiUsage.unitMonth")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">
                  {t("settings.aiUsage.unitDay")}
                </SelectItem>
                <SelectItem value="week">
                  {t("settings.aiUsage.unitWeek")}
                </SelectItem>
                <SelectItem value="month">
                  {t("settings.aiUsage.unitMonth")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!policyDirty || updatePolicy.isPending}
            onClick={handleSavePolicy}
            size="sm"
          >
            {updatePolicy.isPending
              ? t("settings.aiUsage.saving")
              : t("settings.aiUsage.savePeriod")}
          </Button>
        </div>
      </SettingsFormSection>

      <SettingsFormSection
        description={t("settings.aiUsage.byModelDescription")}
        title={t("settings.aiUsage.byModelTitle")}
      >
        {me?.breakdown_by_model.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("settings.aiUsage.noUsage")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.aiUsage.model")}</TableHead>
                <TableHead>{t("settings.aiUsage.feature")}</TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.inputTokens")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.outputTokens")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.cost")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(me?.breakdown_by_model ?? []).map((row) => (
                <TableRow key={`${row.model_id}:${row.feature}`}>
                  <TableCell className="font-mono text-xs">
                    {row.model_id}
                  </TableCell>
                  <TableCell>{row.feature}</TableCell>
                  <TableCell className="text-right">
                    {formatTokens(row.input_tokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(row.output_tokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCostMicros(row.cost_micros, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SettingsFormSection>

      {tenant && tenant.breakdown_by_user.length > 0 && (
        <SettingsFormSection
          description={t("settings.aiUsage.byUserDescription")}
          title={t("settings.aiUsage.byUserTitle")}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.aiUsage.user")}</TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.inputTokens")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.outputTokens")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.cost")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings.aiUsage.requests")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenant.breakdown_by_user.map((row) => (
                <TableRow key={row.user_id ?? "system"}>
                  <TableCell>
                    <div className="font-medium">
                      {aiUsagePerUserLabel(
                        row,
                        t("settings.aiUsage.perUserNoUser")
                      )}
                    </div>
                    {row.user_id &&
                      (row.user_display_name?.trim() ||
                        row.user_email?.trim()) && (
                        <div className="font-mono text-muted-foreground text-xs">
                          {row.user_id}
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(row.input_tokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(row.output_tokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCostMicros(row.cost_micros, currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(row.event_count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsFormSection>
      )}
    </div>
  );
}
