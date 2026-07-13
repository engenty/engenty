import { ApiClientResponseError } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Switch } from "@engenty/ui-core";
import { toast } from "sonner";
import { PageState } from "@/components/PageState";
import { setPluginEnabled } from "@/lib/api/plugins";
import { resolveEffectiveEnabled } from "@/lib/plugins-state";
import { pluginsQuery } from "@/lib/queries/plugins";

function blockedReasonsOf(error: unknown): string[] | null {
  if (
    error instanceof ApiClientResponseError &&
    error.details &&
    typeof error.details === "object" &&
    Array.isArray(
      (error.details as { blockedReasons?: unknown }).blockedReasons
    )
  ) {
    return (error.details as { blockedReasons: string[] }).blockedReasons;
  }
  return null;
}

export function TenantModuleOverrides({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(pluginsQuery(tenantId));

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      setPluginEnabled(vars.id, vars.enabled, tenantId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["manage", "plugins", tenantId],
      }),
    onError: (err) => {
      const reasons = blockedReasonsOf(err);
      if (reasons) {
        toast.error(t("modules.blocked", { reasons: reasons.join(", ") }));
      } else {
        toast.error(err instanceof Error ? err.message : t("common.error"));
      }
    },
  });

  return (
    <div className="p-page">
      <PageState
        error={error}
        isEmpty={(data?.length ?? 0) === 0}
        isLoading={isLoading}
        onRetry={() => void refetch()}
      >
        <div className="divide-y divide-border rounded-lg border border-border">
          {(data ?? []).map((plugin) => {
            const effective = resolveEffectiveEnabled({
              globalEnabled: plugin.globalEnabled,
              tenantOverride: plugin.tenantOverride,
            });
            return (
              <div
                className="flex items-center justify-between gap-4 p-3"
                key={plugin.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{plugin.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {plugin.id}
                    {plugin.tenantOverride === null
                      ? ` · ${t("modules.tenant.useGlobal")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {plugin.mandatory ? (
                    <Badge variant="outline">{t("modules.mandatory")}</Badge>
                  ) : null}
                  <Switch
                    aria-label={plugin.name}
                    checked={effective}
                    disabled={plugin.mandatory || toggle.isPending}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ id: plugin.id, enabled: checked })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </PageState>
    </div>
  );
}
