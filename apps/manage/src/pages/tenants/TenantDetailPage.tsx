import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { StatusBadge, TierBadge } from "@/components/tenant-badges";
import { FeatureFlagsEditor } from "@/features/feature-flags/FeatureFlagsEditor";
import { TenantModuleOverrides } from "@/features/modules/TenantModuleOverrides";
import { TenantMembersTab } from "@/features/tenants/TenantMembersTab";
import {
  setTenantStatus,
  switchToTenant,
  type TenantStatus,
} from "@/lib/api/tenants";
import { tenantQuery } from "@/lib/queries/tenants";

const TABS = new Set(["members", "modules", "featureFlags"]);

export function TenantDetailPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab = tab && TABS.has(tab) ? tab : "members";
  const { data: tenant, isLoading, error, refetch } = useQuery(tenantQuery(id));
  const [pendingStatus, setPendingStatus] = useState<TenantStatus | null>(null);

  const changeStatus = useMutation({
    mutationFn: (status: TenantStatus) => setTenantStatus(id, status),
    onSuccess: async () => {
      toast.success(t("tenants.detail.statusChanged"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "tenants"] });
      setPendingStatus(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const switchTenant = useMutation({
    mutationFn: () => switchToTenant(id),
    onSuccess: () => toast.success(t("tenants.detail.switched")),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const confirmCopy: Record<TenantStatus, string> = {
    active: t("tenants.detail.confirmReactivate"),
    suspended: t("tenants.detail.confirmSuspend"),
    archived: t("tenants.detail.confirmArchive"),
    provisioning: t("tenants.detail.confirmSuspend"),
  };

  return (
    <PageShell
      breadcrumbs={[
        { label: t("tenants.title"), to: "/tenants" },
        { label: tenant?.name ?? "…" },
      ]}
    >
      <div className="space-y-6 p-page">
        <PageState
          error={error}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          {tenant ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="font-semibold text-xl tracking-tight">
                    {tenant.name}
                  </h1>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <span>{tenant.slug}</span>
                    <TierBadge tier={tenant.tier} />
                    <StatusBadge status={tenant.status} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => navigate(`/tenants/${id}/edit`)}
                    size="sm"
                    variant="outline"
                  >
                    {t("tenants.detail.edit")}
                  </Button>
                  <Button
                    disabled={switchTenant.isPending}
                    onClick={() => switchTenant.mutate()}
                    size="sm"
                    variant="outline"
                  >
                    {t("tenants.detail.switchTo")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        {t("tenants.detail.statusMenu")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setPendingStatus("suspended")}
                      >
                        {t("tenants.detail.suspend")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setPendingStatus("active")}
                      >
                        {t("tenants.detail.reactivate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setPendingStatus("archived")}
                      >
                        {t("tenants.detail.archive")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <Tabs
                onValueChange={(next) => {
                  const params = new URLSearchParams(searchParams);
                  if (next === "members") {
                    params.delete("tab");
                  } else {
                    params.set("tab", next);
                  }
                  setSearchParams(params, { replace: true });
                }}
                value={activeTab}
              >
                <TabsList>
                  <TabsTrigger value="members">
                    {t("tenants.tabs.members")}
                  </TabsTrigger>
                  <TabsTrigger value="modules">
                    {t("tenants.tabs.modules")}
                  </TabsTrigger>
                  <TabsTrigger value="featureFlags">
                    {t("tenants.tabs.featureFlags")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="members">
                  <TenantMembersTab tenantId={id} />
                </TabsContent>
                <TabsContent value="modules">
                  <TenantModuleOverrides tenantId={id} />
                </TabsContent>
                <TabsContent value="featureFlags">
                  <FeatureFlagsEditor tenantId={id} />
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </PageState>
      </div>

      <ConfirmDialog
        confirmLabel={t("common.confirm")}
        description={pendingStatus ? confirmCopy[pendingStatus] : ""}
        destructive={
          pendingStatus === "suspended" || pendingStatus === "archived"
        }
        onConfirm={() => pendingStatus && changeStatus.mutate(pendingStatus)}
        onOpenChange={(open) => !open && setPendingStatus(null)}
        open={pendingStatus !== null}
        title={t("tenants.detail.statusMenu")}
      />
    </PageShell>
  );
}
