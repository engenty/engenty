import {
  FeatureFlagsProvider,
  PageHeaderProvider,
  WorkspaceProvider,
} from "@engenty/ui-plugin-sdk";
import { AppLayoutFrame } from "./app-layout-frame";
import type { AppLayoutProps } from "./types";

export type { AppLayoutProps } from "./types";

export function AppLayout({
  appMenuActions,
  sections,
  shell,
  fetchResolvedFeatureFlags,
  defaultTopbarTitle,
  children,
  currentUserId = null,
  isSuperAdmin = false,
  isTenantAdmin = false,
  modulesReorderable,
  onModulesReorder,
  shellUiHost,
  secondaryNavPersistence,
}: AppLayoutProps) {
  const currentTenant = shell.tenantSwitcher?.currentTenant ?? null;

  return (
    <WorkspaceProvider
      currentTenant={currentTenant}
      currentUserId={currentUserId}
      isSuperAdmin={isSuperAdmin}
      isTenantAdmin={isTenantAdmin}
    >
      <FeatureFlagsProvider fetchResolved={fetchResolvedFeatureFlags}>
        <PageHeaderProvider>
          <AppLayoutFrame
            appMenuActions={appMenuActions}
            defaultTopbarTitle={defaultTopbarTitle}
            fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
            modulesReorderable={modulesReorderable}
            onModulesReorder={onModulesReorder}
            secondaryNavPersistence={secondaryNavPersistence}
            sections={sections}
            shell={shell}
          >
            {children}
          </AppLayoutFrame>
          {shellUiHost}
        </PageHeaderProvider>
      </FeatureFlagsProvider>
    </WorkspaceProvider>
  );
}
