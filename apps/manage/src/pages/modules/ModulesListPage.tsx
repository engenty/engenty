import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { AdminListTableView, Badge, Input, Switch } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { setPluginEnabled } from "@/lib/api/plugins";
import { pluginsQuery } from "@/lib/queries/plugins";

export function ModulesListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(pluginsQuery());
  const [filter, setFilter] = useState("");
  const [restartRequired, setRestartRequired] = useState(false);

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      setPluginEnabled(vars.id, vars.enabled),
    onSuccess: async () => {
      setRestartRequired(true);
      await queryClient.invalidateQueries({
        queryKey: ["manage", "plugins", "global"],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("modules.toggleFailed")
      ),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const term = filter.trim().toLowerCase();
    if (!term) {
      return list;
    }
    return list.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(term) ||
        plugin.id.toLowerCase().includes(term)
    );
  }, [data, filter]);

  return (
    <PageShell
      breadcrumbs={[{ label: t("modules.title") }]}
      title={t("modules.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        {restartRequired ? (
          <div className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {t("modules.restartRequired")}
          </div>
        ) : null}
        <Input
          aria-label={t("modules.filterPlaceholder")}
          className="max-w-xs shrink-0"
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("modules.filterPlaceholder")}
          value={filter}
        />
        <PageState
          error={error}
          isEmpty={rows.length === 0}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <AdminListTableView>
            <div className="divide-y divide-border/50">
              {rows.map((plugin) => (
                <div
                  className="flex items-center justify-between gap-4 p-3"
                  key={plugin.id}
                >
                  <button
                    className="min-w-0 text-left"
                    onClick={() => navigate(`/modules/${plugin.id}`)}
                    type="button"
                  >
                    <p className="truncate font-medium text-sm">
                      {plugin.name}
                      {plugin.version ? (
                        <span className="ml-2 text-muted-foreground text-xs">
                          {plugin.version}
                        </span>
                      ) : null}
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>{plugin.id}</span>
                      {plugin.loaded ? (
                        <Badge variant="secondary">{t("modules.loaded")}</Badge>
                      ) : null}
                      {plugin.mandatory ? (
                        <Badge variant="outline">
                          {t("modules.mandatory")}
                        </Badge>
                      ) : null}
                      {plugin.diagnosticsCount > 0 ? (
                        <Badge variant="outline">
                          {t("modules.diagnostics", {
                            count: plugin.diagnosticsCount,
                          })}
                        </Badge>
                      ) : null}
                    </p>
                  </button>
                  <Switch
                    aria-label={plugin.name}
                    checked={plugin.globalEnabled}
                    disabled={plugin.mandatory || toggle.isPending}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ id: plugin.id, enabled: checked })
                    }
                  />
                </div>
              ))}
            </div>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
