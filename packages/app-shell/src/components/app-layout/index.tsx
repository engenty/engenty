import {
  FeatureFlagsProvider,
  PageHeaderProvider,
  WorkspaceProvider,
} from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import { AppBarChromeProvider } from "../../context/app-bar-chrome-context";
import { useAppBarPosition } from "../../hooks/use-app-bar-chrome";
import {
  appBarTooltipSide,
  isHorizontalAppBarPosition,
} from "../../types/shell-app-bar-position";
import { AppLayoutFrame } from "./app-layout-frame";
import type { AppLayoutProps } from "./types";

export type { AppLayoutProps } from "./types";

/** Puts app-bar edge on the shell tree so portaled Copilot chrome can hang correctly. */
function AppBarChromeRoot({ children }: { children: ReactNode }) {
  const position = useAppBarPosition();
  const horizontal = isHorizontalAppBarPosition(position);
  return (
    <AppBarChromeProvider
      value={{
        // Shell-tree default; the rail's own provider sets the real value.
        extended: false,
        orientation: horizontal ? "horizontal" : "vertical",
        position,
        tooltipSide: appBarTooltipSide(position),
      }}
    >
      {children}
    </AppBarChromeProvider>
  );
}

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
  appBarPositionPersistence,
  appBarThemes,
  railCopilotSlot,
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
          <AppBarChromeRoot>
            <AppLayoutFrame
              appBarPositionPersistence={appBarPositionPersistence}
              appBarThemes={appBarThemes}
              appMenuActions={appMenuActions}
              defaultTopbarTitle={defaultTopbarTitle}
              fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
              modulesReorderable={modulesReorderable}
              onModulesReorder={onModulesReorder}
              railCopilotSlot={railCopilotSlot}
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
          </AppBarChromeRoot>
        </PageHeaderProvider>
      </FeatureFlagsProvider>
    </WorkspaceProvider>
  );
}
