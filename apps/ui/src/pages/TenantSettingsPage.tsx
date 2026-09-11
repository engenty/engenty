import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import { CardSection, Spinner } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Check } from "lucide-react";
import { useMemo } from "react";
import { switchWorkspaceTenant } from "@/lib/switch-current-tenant";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";

/**
 * Superadmin tenant hop. Used to live in the rail popover; Settings is the
 * only place that switches tenants now.
 */
export function TenantSettingsPage() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const workspaceQuery = useWorkspaceContextQuery(true);
  const currentTenantId = workspaceQuery.data?.currentTenant?.id ?? null;
  const tenants = workspaceQuery.data?.tenants ?? [];

  const switchMutation = useMutation({
    mutationFn: (tenantId: string) =>
      switchWorkspaceTenant(
        tenantId,
        queryClient,
        t("settings.tenant.sessionRefreshFailed")
      ),
  });

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.tenant.title") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
        <CardSection
          cardVariant="flush"
          description={t("settings.tenant.description")}
          title={t("settings.tenant.title")}
        >
          {workspaceQuery.isPending ? (
            <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {t("shell.loading")}
            </div>
          ) : tenants.length === 0 ? (
            <p className="px-4 py-3 text-muted-foreground text-sm">
              {t("settings.tenant.empty")}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {tenants.map((tenant) => {
                const isCurrent = tenant.id === currentTenantId;
                const disabled = isCurrent || switchMutation.isPending;
                return (
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent"
                    disabled={disabled}
                    key={tenant.id}
                    onClick={() => {
                      if (disabled) {
                        return;
                      }
                      void switchMutation.mutateAsync(tenant.id);
                    }}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">
                        {tenant.name}
                      </p>
                      {tenant.slug ? (
                        <p className="truncate text-muted-foreground text-xs">
                          {tenant.slug}
                        </p>
                      ) : null}
                    </div>
                    {isCurrent ? (
                      <Check className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </CardSection>
      </div>
    </div>
  );
}
