import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Badge,
  DetailPageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { PageState } from "@/components/PageState";
import { formatMicros } from "@/features/packages/package-format";
import type { EntitlementPackage } from "@/lib/api/entitlements";
import { packageQuery } from "@/lib/queries/entitlements";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm sm:grid-cols-[12rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function PackageFields({ pkg }: { pkg: EntitlementPackage }) {
  const { t } = useTranslation("common");
  const flagEntries = Object.entries(pkg.featureFlags).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const ai = pkg.aiUsagePolicy;

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="font-medium text-sm">{t("packages.detail.limits")}</h2>
        <div className="divide-y divide-border rounded-lg border border-border px-3">
          <Field
            label={t("packages.columns.seats")}
            value={pkg.appLimits.maxUsers ?? "∞"}
          />
          <Field
            label={t("packages.detail.seatsEnforcement")}
            value={
              <Badge
                variant={
                  pkg.appLimits.enforcement_mode === "enforce"
                    ? "default"
                    : "secondary"
                }
              >
                {t(`packages.mode.${pkg.appLimits.enforcement_mode}`)}
              </Badge>
            }
          />
          <Field
            label={t("packages.columns.modules")}
            value={
              pkg.modules === null
                ? t("packages.allModules")
                : pkg.modules.length === 0
                  ? "—"
                  : pkg.modules.join(", ")
            }
          />
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="font-medium text-sm">{t("packages.detail.ai")}</h2>
        <div className="divide-y divide-border rounded-lg border border-border px-3">
          <Field
            label={t("packages.columns.aiLimit")}
            value={formatMicros(ai.hard_limit_cost_micros)}
          />
          <Field
            label={t("packages.detail.included")}
            value={formatMicros(ai.included_cost_micros)}
          />
          <Field
            label={t("packages.detail.softLimit")}
            value={formatMicros(ai.soft_limit_cost_micros)}
          />
          <Field
            label={t("packages.columns.enforcement")}
            value={
              <Badge
                variant={
                  ai.enforcement_mode === "enforce" ? "default" : "secondary"
                }
              >
                {t(`packages.mode.${ai.enforcement_mode}`)}
              </Badge>
            }
          />
          <Field
            label={t("packages.detail.period")}
            value={`${ai.period_mode} / ${ai.period_unit}`}
          />
          <Field label={t("packages.detail.currency")} value={ai.currency} />
          <Field
            label={t("packages.detail.allowedModels")}
            value={
              ai.allowed_models === null
                ? t("packages.detail.allModels")
                : ai.allowed_models.length === 0
                  ? "—"
                  : ai.allowed_models.join(", ")
            }
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-sm">
          {t("packages.detail.featureFlags")}
        </h2>
        {flagEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("packages.detail.noFeatureFlags")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("packages.detail.flagKey")}</TableHead>
                <TableHead>{t("packages.detail.flagValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flagEntries.map(([key, enabled]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs">{key}</TableCell>
                  <TableCell>
                    <Badge variant={enabled ? "default" : "outline"}>
                      {enabled ? t("featureFlags.on") : t("featureFlags.off")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

export function PackageDetailPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = useQuery(packageQuery(id));

  const breadcrumbs = useMemo(
    () => [
      { label: t("packages.title"), to: "/packages" },
      { label: data?.label ?? id ?? "…" },
    ],
    [data?.label, id, t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
    topbarOverlap: true,
  });

  if (isLoading || error || !data) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-11">
        <PageState
          error={error}
          isEmpty={!(isLoading || error)}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          {null}
        </PageState>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DetailPageHeader
        description={
          <p className="text-muted-foreground text-sm">
            {t("packages.detail.authoredHint")}
          </p>
        }
        eyebrow={`${data.id} · v${data.version}`}
        maxWidth="5xl"
        status={
          <Badge
            variant={
              data.aiUsagePolicy.enforcement_mode === "enforce"
                ? "default"
                : "secondary"
            }
          >
            {t(`packages.mode.${data.aiUsagePolicy.enforcement_mode}`)}
          </Badge>
        }
        title={data.label}
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-10">
        <div className="mx-auto w-full max-w-5xl p-page pb-10">
          <PackageFields pkg={data} />
        </div>
      </div>
    </div>
  );
}
