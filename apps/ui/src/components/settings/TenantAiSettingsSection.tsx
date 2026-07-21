import { DEFAULT_AI_CHAT_MODEL_ID } from "@engenty/ai-core/browser";
import { useAiSettingsQuery } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection, Skeleton } from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import { BarChart3Icon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAiUsageMeQuery } from "@/lib/ai-usage-queries";

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

function shortModelId(modelId: string): string {
  const slash = modelId.lastIndexOf("/");
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

/** Compact billing window, e.g. "1–21 Jul" or "28 Jun – 21 Jul". */
function formatPeriodCompact(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "—";
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(
      start
    );
    return `${start.getDate()}–${end.getDate()} ${month}`;
  }
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  };
  const fmt = new Intl.DateTimeFormat(undefined, opts);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

interface AiOverviewRowProps {
  description: string;
  Icon: LucideIcon;
  label: string;
  loading?: boolean;
  to: string;
}

function AiOverviewRow({
  description,
  Icon,
  label,
  loading,
  to,
}: AiOverviewRowProps) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
      to={to}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-foreground text-sm">
          {label}
        </span>
        {loading ? (
          <Skeleton className="mt-1 h-3 w-40" />
        ) : (
          <span className="truncate text-muted-foreground text-xs">
            {description}
          </span>
        )}
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40" />
    </Link>
  );
}

export function TenantAiSettingsSection() {
  const { t } = useTranslation("common");
  const settingsQuery = useAiSettingsQuery();
  const usageQuery = useAiUsageMeQuery();

  const chatModelId =
    settingsQuery.data?.chat_model_id?.trim() || DEFAULT_AI_CHAT_MODEL_ID;
  const modelsDescription = t("settings.ai.modelsOverview", {
    model: shortModelId(chatModelId),
  });

  const usage = usageQuery.data;
  const costLabel = formatCostMicros(
    usage?.tenant_totals?.cost_micros,
    usage?.currency ?? "usd"
  );
  const whenLabel =
    usage == null
      ? "—"
      : formatPeriodCompact(usage.period_start, usage.period_end);
  const hardLimit = usage?.hard_limit_cost_micros;
  const usageDescription =
    usage == null
      ? t("settings.aiUsage.loading")
      : hardLimit == null
        ? t("settings.ai.usageOverview", { cost: costLabel, when: whenLabel })
        : t("settings.ai.usageOverviewWithLimit", {
            cost: costLabel,
            limit: formatCostMicros(hardLimit, usage.currency),
            when: whenLabel,
          });

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.ai.overviewDescription")}
      title={t("settings.ai.title")}
    >
      <div className="divide-y divide-border">
        <AiOverviewRow
          description={modelsDescription}
          Icon={SparklesIcon}
          label={t("settings.aiModels.menuLabel")}
          loading={settingsQuery.isLoading && !settingsQuery.data}
          to="/settings/ai"
        />
        <AiOverviewRow
          description={usageDescription}
          Icon={BarChart3Icon}
          label={t("settings.aiUsage.menuLabel")}
          loading={usageQuery.isLoading && !usageQuery.data}
          to="/settings/ai-usage"
        />
      </div>
    </SettingsFormSection>
  );
}
