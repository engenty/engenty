import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import type { EntitlementPackage } from "@/lib/api/entitlements";
import { formatMicros, moduleSummary } from "./package-format";

/**
 * Compact key facts for a commercial package — seats, modules, AI cap,
 * enforcement. Used in the create-tenant dialog under the package picker.
 */
export function PackageSummary({ pkg }: { pkg: EntitlementPackage }) {
  const { t } = useTranslation("common");
  const seats = pkg.appLimits.maxUsers ?? "∞";
  const modules = moduleSummary(pkg.modules, t("packages.allModules"));
  const aiLimit = formatMicros(pkg.aiUsagePolicy.hard_limit_cost_micros);
  const mode = pkg.aiUsagePolicy.enforcement_mode;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm sm:grid-cols-4">
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">
          {t("packages.columns.seats")}
        </dt>
        <dd className="font-medium tabular-nums">{seats}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">
          {t("packages.columns.modules")}
        </dt>
        <dd className="font-medium tabular-nums">{modules}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">
          {t("packages.columns.aiLimit")}
        </dt>
        <dd className="font-medium tabular-nums">{aiLimit}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">
          {t("packages.columns.enforcement")}
        </dt>
        <dd>
          <Badge variant={mode === "enforce" ? "default" : "secondary"}>
            {t(`packages.mode.${mode}`)}
          </Badge>
        </dd>
      </div>
    </dl>
  );
}
