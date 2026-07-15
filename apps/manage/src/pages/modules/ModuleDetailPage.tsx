import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import {
  type PluginDetail,
  type PluginLifecycleOperation,
  type PluginLifecycleReport,
  runPluginLifecycle,
} from "@/lib/api/plugins";
import { pluginQuery, pluginReportQuery } from "@/lib/queries/plugins";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

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
          {data ? (
            <div className="space-y-6">
              <ModuleFields detail={data} t={t} />
              <ModuleLifecycle detail={data} t={t} />
            </div>
          ) : null}
        </PageState>
      </div>
    </PageShell>
  );
}

function ModuleFields({ detail, t }: { detail: PluginDetail; t: Translate }) {
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

function ModuleLifecycle({
  detail,
  t,
}: {
  detail: PluginDetail;
  t: Translate;
}) {
  const queryClient = useQueryClient();
  // Which confirm dialog is open (null = none). `reload` and `uninstall` fetch
  // a preflight report; `update` runs a package update with no preflight.
  const [op, setOp] = useState<PluginLifecycleOperation | null>(null);

  const reportKind = op === "uninstall" ? "uninstall" : "reload";
  const report = useQuery({
    ...pluginReportQuery(detail.id, reportKind),
    enabled: op === "reload" || op === "uninstall",
  });

  const run = useMutation({
    mutationFn: (operation: PluginLifecycleOperation) =>
      runPluginLifecycle(detail.id, operation),
    onSuccess: async () => {
      toast.success(t("modules.lifecycle.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "plugins"] });
      setOp(null);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("modules.lifecycle.failed")
      ),
  });

  const blocked = isReportBlocked(op, report.data);

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="font-medium text-sm">{t("modules.lifecycle.title")}</h2>
      <p className="mt-1 text-muted-foreground text-xs">
        {t("modules.lifecycle.subtitle")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={!detail.loaded || run.isPending}
          onClick={() => setOp("reload")}
          size="sm"
          variant="outline"
        >
          {t("modules.lifecycle.reload")}
        </Button>
        <Button
          disabled={run.isPending}
          onClick={() => setOp("update")}
          size="sm"
          variant="outline"
        >
          {t("modules.lifecycle.update")}
        </Button>
        <Button
          className="border-destructive text-destructive hover:bg-destructive/10"
          disabled={detail.mandatory || run.isPending}
          onClick={() => setOp("uninstall")}
          size="sm"
          variant="outline"
        >
          {t("modules.lifecycle.uninstall")}
        </Button>
      </div>

      <Dialog
        onOpenChange={(next) => setOp(next ? op : null)}
        open={op !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {op ? t(`modules.lifecycle.dialog.${op}Title`) : ""}
            </DialogTitle>
            <DialogDescription>
              {op ? t(`modules.lifecycle.dialog.${op}Body`) : ""}
            </DialogDescription>
          </DialogHeader>

          {op === "reload" || op === "uninstall" ? (
            <PreflightReport
              blocked={blocked}
              isLoading={report.isLoading}
              report={report.data}
              t={t}
            />
          ) : null}

          <DialogFooter>
            <Button
              disabled={run.isPending}
              onClick={() => setOp(null)}
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className={
                op === "uninstall"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={run.isPending || blocked || report.isLoading}
              onClick={() => op && run.mutate(op)}
            >
              {t("modules.lifecycle.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreflightReport({
  report,
  isLoading,
  blocked,
  t,
}: {
  report: PluginLifecycleReport | undefined;
  isLoading: boolean;
  blocked: boolean;
  t: Translate;
}) {
  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("modules.lifecycle.checking")}
      </p>
    );
  }
  if (!report) {
    return null;
  }
  const issues = report.issues ?? [];
  return (
    <div className="space-y-2 text-sm">
      <Badge
        className={blocked ? "border-destructive text-destructive" : undefined}
        variant={blocked ? "outline" : "secondary"}
      >
        {blocked
          ? t("modules.lifecycle.preflightBlocked")
          : t("modules.lifecycle.preflightOk")}
      </Badge>
      {report.requiresRestart ? (
        <p className="text-amber-600 text-xs dark:text-amber-400">
          {t("modules.lifecycle.requiresRestart")}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li className="flex items-start gap-2 text-xs" key={issue.code}>
              <Badge
                className={
                  issue.level === "error"
                    ? "border-destructive text-destructive"
                    : undefined
                }
                variant="outline"
              >
                {issue.level}
              </Badge>
              <span className="break-words">{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isReportBlocked(
  op: PluginLifecycleOperation | null,
  report: PluginLifecycleReport | undefined
): boolean {
  if (!report) {
    return false;
  }
  if (op === "reload") {
    return report.preflightPassed === false;
  }
  if (op === "uninstall") {
    return report.removableAtRuntime === false;
  }
  return false;
}
