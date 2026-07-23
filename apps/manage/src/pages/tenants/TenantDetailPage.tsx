import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  DetailPageHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageState } from "@/components/PageState";
import { StatusBadge, TierBadge } from "@/components/tenant-badges";
import { TenantAutomationTab } from "@/features/automation/TenantAutomationTab";
import { TenantBillingTab } from "@/features/billing/TenantBillingTab";
import { TenantEntitlementsTab } from "@/features/entitlements/TenantEntitlementsTab";
import { FeatureFlagsEditor } from "@/features/feature-flags/FeatureFlagsEditor";
import { TenantModuleOverrides } from "@/features/modules/TenantModuleOverrides";
import { TenantMembersTab } from "@/features/tenants/TenantMembersTab";
import {
  setTenantStatus,
  switchToTenant,
  type TenantStatus,
} from "@/lib/api/tenants";
import { tenantQuery } from "@/lib/queries/tenants";

const DEFAULT_TAB = "members";
const TABS = new Set([
  DEFAULT_TAB,
  "modules",
  "featureFlags",
  "entitlements",
  "billing",
  "automation",
]);

export function TenantDetailPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab = tab && TABS.has(tab) ? tab : DEFAULT_TAB;
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

  const breadcrumbs = useMemo(
    () => [
      { label: t("tenants.title"), to: "/tenants" },
      { label: tenant?.name ?? "…" },
    ],
    [t, tenant?.name]
  );

  // Primary actions live in the shell topbar (core-UI detail-page convention);
  // the header itself carries only the entity's identity + state.
  const pageActions = useMemo(
    () =>
      tenant ? (
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
              <DropdownMenuItem onClick={() => setPendingStatus("suspended")}>
                {t("tenants.detail.suspend")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPendingStatus("active")}>
                {t("tenants.detail.reactivate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPendingStatus("archived")}>
                {t("tenants.detail.archive")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null,
    [id, navigate, switchTenant, t, tenant]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend into
    // one continuous surface (matches the AI settings / contact detail pages).
    topbarOverlap: true,
  });

  const handleTabChange = (next: string) => {
    if (!TABS.has(next) || next === activeTab) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true });
  };

  if (isLoading || error || !tenant) {
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
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <DetailPageHeader
          belowStrip={
            <TabsList
              className="-mb-px w-fit border-0 bg-transparent p-0"
              variant="line"
            >
              <TabsTrigger value="members">
                {t("tenants.tabs.members")}
              </TabsTrigger>
              <TabsTrigger value="modules">
                {t("tenants.tabs.modules")}
              </TabsTrigger>
              <TabsTrigger value="featureFlags">
                {t("tenants.tabs.featureFlags")}
              </TabsTrigger>
              <TabsTrigger value="entitlements">
                {t("tenants.tabs.entitlements")}
              </TabsTrigger>
              <TabsTrigger value="billing">
                {t("tenants.tabs.billing")}
              </TabsTrigger>
              <TabsTrigger value="automation">
                {t("tenants.tabs.automation")}
              </TabsTrigger>
            </TabsList>
          }
          eyebrow={tenant.slug}
          maxWidth="7xl"
          status={
            <div className="flex items-center gap-2">
              <TierBadge tier={tenant.tier} />
              <StatusBadge status={tenant.status} />
            </div>
          }
          title={tenant.name}
        />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-10">
          <div className="mx-auto w-full max-w-7xl space-y-6 p-page pb-10">
            <TabsContent value="members">
              <TenantMembersTab tenantId={id} />
            </TabsContent>
            <TabsContent value="modules">
              <TenantModuleOverrides tenantId={id} />
            </TabsContent>
            <TabsContent value="featureFlags">
              <FeatureFlagsEditor tenantId={id} />
            </TabsContent>
            <TabsContent value="entitlements">
              <TenantEntitlementsTab tenantId={id} />
            </TabsContent>
            <TabsContent value="billing">
              <TenantBillingTab tenantId={id} />
            </TabsContent>
            <TabsContent value="automation">
              <TenantAutomationTab tenantId={id} />
            </TabsContent>
          </div>
        </div>
      </Tabs>

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
    </div>
  );
}
