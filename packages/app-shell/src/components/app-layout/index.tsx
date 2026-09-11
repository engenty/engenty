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
  currentSpace = null,
  currentTenant = null,
  currentUserId = null,
  isSuperAdmin = false,
  isTenantAdmin = false,
  modulesReorderable,
  onModulesReorder,
  shellUiHost,
  secondaryNavHeaderOverride,
  secondaryNavFooterSlot,
  secondaryNavLeadingSlot,
  secondaryNavRouteBreadcrumb,
  secondaryNavRouteTransition,
  secondaryNavPersistence,
  railEndSlot,
  spacesZone,
}: AppLayoutProps) {
  return (
    <WorkspaceProvider
      currentSpace={currentSpace}
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
            railEndSlot={railEndSlot}
            secondaryNavFooterSlot={secondaryNavFooterSlot}
            secondaryNavHeaderOverride={secondaryNavHeaderOverride}
            secondaryNavLeadingSlot={secondaryNavLeadingSlot}
            secondaryNavPersistence={secondaryNavPersistence}
            secondaryNavRouteBreadcrumb={secondaryNavRouteBreadcrumb}
            secondaryNavRouteTransition={secondaryNavRouteTransition}
            sections={sections}
            shell={shell}
            spacesZone={spacesZone}
          >
            {children}
          </AppLayoutFrame>
          {shellUiHost}
        </PageHeaderProvider>
      </FeatureFlagsProvider>
    </WorkspaceProvider>
  );
}
