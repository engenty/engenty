import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListTableView,
  Button,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { modelPricingHistoryQuery } from "@/lib/queries/ai-models";
import { formatMicros } from "./model-catalog";

const AI_MODELS_PATH = "/settings/ai-models";

export function AiModelPricingHistoryPage() {
  const { t } = useTranslation("common");
  const pricing = useQuery(modelPricingHistoryQuery);
  const rows = pricing.data ?? [];
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.aiModels.menuLabel"), to: AI_MODELS_PATH },
      { label: t("aiModels.historyTitle") },
    ],
    [moduleRootCrumb, t]
  );

  const actions = useMemo(
    () => (
      <Button asChild size="sm" variant="outline">
        <Link to={AI_MODELS_PATH}>
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          {t("aiModels.backToCatalog")}
        </Link>
      </Button>
    ),
    [t]
  );

  return (
    <PageShell
      actions={actions}
      breadcrumbs={breadcrumbs}
      secondaryNavHeaderSlot={secondaryNavHeaderSlot}
      topbarChrome="contentBlend"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">
          {t("aiModels.historyDescription")}
        </p>

        <PageState
          error={pricing.error}
          isEmpty={rows.length === 0}
          isLoading={pricing.isLoading}
          onRetry={() => void pricing.refetch()}
        >
          <AdminListTableView bottomFade stickyHeaderShadow transparent>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("aiModels.columns.modelId")}</TableHead>
                  <TableHead>{t("aiModels.columns.validFrom")}</TableHead>
                  <TableHead className="text-right">
                    {t("aiModels.columns.inputPerMtok")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("aiModels.columns.outputPerMtok")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("aiModels.columns.cachedPerMtok")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("aiModels.columns.reasoningPerMtok")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.model_id}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(row.valid_from).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMicros(row.input_per_mtok_micros, row.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMicros(row.output_per_mtok_micros, row.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMicros(
                        row.cached_input_per_mtok_micros,
                        row.currency
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMicros(
                        row.reasoning_per_mtok_micros,
                        row.currency
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
