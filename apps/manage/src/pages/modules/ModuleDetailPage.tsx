import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Badge } from "@engenty/ui-core";
import { useParams } from "react-router-dom";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import type { PluginDetail } from "@/lib/api/plugins";
import { pluginQuery } from "@/lib/queries/plugins";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

export function ModuleDetailPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = useQuery(pluginQuery(id));

  return (
    <PageShell
      breadcrumbs={[
        { label: t("modules.title"), to: "/modules" },
        { label: data?.name ?? "…" },
      ]}
      title={data?.name}
    >
      <div className="max-w-2xl p-page">
        <PageState
          error={error}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          {data ? <ModuleFields detail={data} t={t} /> : null}
        </PageState>
      </div>
    </PageShell>
  );
}

function ModuleFields({
  detail,
  t,
}: {
  detail: PluginDetail;
  t: (key: string) => string;
}) {
  return (
    <div className="divide-y divide-border">
      <div className="flex items-center gap-2 pb-3">
        <Badge variant={detail.globalEnabled ? "default" : "outline"}>
          {detail.globalEnabled ? t("modules.enabled") : t("modules.disabled")}
        </Badge>
        {detail.loaded ? (
          <Badge variant="secondary">{t("modules.loaded")}</Badge>
        ) : null}
        {detail.mandatory ? (
          <Badge variant="outline">{t("modules.mandatory")}</Badge>
        ) : null}
      </div>
      <Field
        label={t("modules.detail.package")}
        value={detail.packageName ?? "—"}
      />
      <Field
        label={t("modules.detail.version")}
        value={detail.version ?? "—"}
      />
      <Field
        label={t("modules.detail.manifest")}
        value={detail.manifestPath ?? "—"}
      />
      <Field label={t("modules.detail.source")} value={detail.source ?? "—"} />
      <Field
        label={t("modules.detail.dependencies")}
        value={
          detail.dependencies && detail.dependencies.length > 0
            ? detail.dependencies.join(", ")
            : "—"
        }
      />
      <Field
        label={t("modules.detail.routes")}
        value={detail.routesCount ?? 0}
      />
      <Field
        label={t("modules.detail.services")}
        value={detail.servicesCount ?? 0}
      />
      <Field
        label={t("modules.detail.operations")}
        value={detail.operationsCount ?? 0}
      />
      {detail.loadError ? (
        <Field
          label={t("modules.detail.loadError")}
          value={<span className="text-destructive">{detail.loadError}</span>}
        />
      ) : null}
    </div>
  );
}
