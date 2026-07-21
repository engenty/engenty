// Roles & permissions console (/setup/roles). Tenant-admin/superadmin view
// into the authz system: role registry, capability catalog, assignments for
// users + agents, and an effective-grants inspector. Unified detail-page header
// (title + line tabs) with the primary CTA in the shell topbar.

import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DetailPageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AssignmentsTab } from "@/features/roles-admin/assignments-tab";
import { CapabilityCatalogTab } from "@/features/roles-admin/capability-catalog-tab";
import { InspectorTab } from "@/features/roles-admin/inspector-tab";
import { RolesListTab } from "@/features/roles-admin/roles-list-tab";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";

const DEFAULT_TAB = "roles";
const BASE_TABS = [DEFAULT_TAB, "capabilities", "assignments"];

export function RolesSettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useWorkspaceContextQuery(true);
  const tenantId = workspace.data?.currentTenant?.id ?? null;
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  // Inspector is a developer/diagnostic tool — only shown in developer mode.
  const developerModeEnabled = useDeveloperModeEnabled();

  const validTabs = useMemo(
    () =>
      new Set(developerModeEnabled ? [...BASE_TABS, "inspector"] : BASE_TABS),
    [developerModeEnabled]
  );

  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam && validTabs.has(tabParam) ? tabParam : DEFAULT_TAB;

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.roles.menuLabel") },
    ],
    [moduleRootCrumb, t]
  );

  // Primary CTA lives in the shell topbar; only meaningful on the Roles tab.
  const actions = useMemo(
    () =>
      activeTab === "roles" && tenantId ? (
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => setNewRoleOpen(true)}
          size="sm"
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          New custom role
        </Button>
      ) : null,
    [activeTab, tenantId]
  );

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend into
    // one continuous surface (matches the contact detail page).
    topbarOverlap: true,
  });

  const handleTabChange = (next: string) => {
    if (!validTabs.has(next) || next === activeTab) {
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
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              {developerModeEnabled && (
                <TabsTrigger value="inspector">Inspector</TabsTrigger>
              )}
            </TabsList>
          }
          description={
            <p className="text-muted-foreground text-sm">
              Roles are named capability bundles. Enforcement everywhere is
              capability-based — this is where you see and manage the bundles.
            </p>
          }
          title="Roles & permissions"
        />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-5xl">
            {tenantId ? (
              <>
                <TabsContent value="roles">
                  <RolesListTab
                    newRoleOpen={newRoleOpen}
                    onNewRoleOpenChange={setNewRoleOpen}
                    tenantId={tenantId}
                  />
                </TabsContent>
                <TabsContent value="capabilities">
                  <CapabilityCatalogTab />
                </TabsContent>
                <TabsContent value="assignments">
                  <AssignmentsTab tenantId={tenantId} />
                </TabsContent>
                {developerModeEnabled && (
                  <TabsContent value="inspector">
                    <InspectorTab tenantId={tenantId} />
                  </TabsContent>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Loading tenant…</p>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
