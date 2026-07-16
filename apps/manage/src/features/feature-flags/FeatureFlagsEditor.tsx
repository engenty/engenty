import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button, Switch } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageState } from "@/components/PageState";
import {
  type FeatureFlagDefinition,
  type FeatureFlagsManageResponse,
  saveFlagUpdates,
} from "@/lib/api/feature-flags";
import { featureFlagsQuery } from "@/lib/queries/feature-flags";

/**
 * Global (no tenantId) or per-tenant feature-flag editor. Staged toggles batch
 * into one PUT. In tenant scope, rows show default → global → tenant override →
 * resolved; the switch edits the tenant override.
 */
export function FeatureFlagsEditor({ tenantId }: { tenantId?: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(
    featureFlagsQuery(tenantId)
  );
  const [staged, setStaged] = useState<Record<string, boolean>>({});

  const save = useMutation({
    mutationFn: () =>
      saveFlagUpdates(
        Object.entries(staged).map(([key, enabled]) => ({
          key,
          tenant_id: tenantId ?? null,
          enabled,
        }))
      ),
    onSuccess: async () => {
      toast.success(t("featureFlags.saved"));
      setStaged({});
      await queryClient.invalidateQueries({
        queryKey: ["manage", "flags", tenantId ?? "global"],
      });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const groups = useMemo(() => groupByPlugin(data?.definitions ?? []), [data]);
  const dirty = Object.keys(staged).length > 0;

  const scopeValue = (
    def: FeatureFlagDefinition,
    manage: FeatureFlagsManageResponse
  ) => {
    if (def.key in staged) {
      return staged[def.key];
    }
    if (tenantId) {
      return def.key in manage.tenant
        ? manage.tenant[def.key]
        : (manage.global[def.key] ?? def.default);
    }
    return manage.global[def.key] ?? def.default;
  };

  return (
    <div className="space-y-4 p-page">
      <PageState
        error={error}
        isEmpty={(data?.definitions.length ?? 0) === 0}
        isLoading={isLoading}
        onRetry={() => void refetch()}
      >
        {data ? (
          <>
            <div className="flex justify-end">
              <Button
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
                size="sm"
              >
                {t("featureFlags.save")}
              </Button>
            </div>
            <div className="space-y-6">
              {groups.map(([pluginId, defs]) => (
                <section key={pluginId}>
                  <h2 className="mb-2 font-medium text-muted-foreground text-sm">
                    {pluginId}
                  </h2>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {defs.map((def) => (
                      <div
                        className="flex items-center justify-between gap-4 p-3"
                        key={def.key}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm">
                            {flagLabel(def)}
                          </p>
                          <p className="truncate font-mono text-muted-foreground text-xs">
                            {def.key}
                          </p>
                          {tenantId ? (
                            <p className="text-muted-foreground text-xs">
                              {t("featureFlags.resolved")}:{" "}
                              {data.resolved[def.key]
                                ? t("featureFlags.on")
                                : t("featureFlags.off")}
                            </p>
                          ) : (
                            <Badge variant="outline">
                              {t("featureFlags.default")}:{" "}
                              {def.default
                                ? t("featureFlags.on")
                                : t("featureFlags.off")}
                            </Badge>
                          )}
                        </div>
                        <Switch
                          aria-label={def.key}
                          checked={scopeValue(def, data)}
                          onCheckedChange={(checked) =>
                            setStaged((prev) => ({
                              ...prev,
                              [def.key]: checked,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </PageState>
    </div>
  );
}

/**
 * Readable label derived from the flag key's last dot-segment. Manage doesn't
 * load module i18n namespaces, so `def.labelKey` can't resolve here — this gives
 * a friendly label while the raw key stays visible below for precision.
 */
function flagLabel(def: FeatureFlagDefinition): string {
  const leaf = def.key.split(".").pop() || def.key;
  const words = leaf.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : def.key;
}

function groupByPlugin(
  definitions: FeatureFlagDefinition[]
): [string, FeatureFlagDefinition[]][] {
  const map = new Map<string, FeatureFlagDefinition[]>();
  for (const def of definitions) {
    const list = map.get(def.pluginId) ?? [];
    list.push(def);
    map.set(def.pluginId, list);
  }
  return [...map.entries()];
}
