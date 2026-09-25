/**
 * The part of the shell that reads the URL.
 *
 * Copilot, AI, and live-sync sit above this component and do not subscribe to
 * the router. A space switch re-renders this frame — the column and the
 * outlet — and leaves that machinery mounted.
 */
import {
  AgUiAgentInspectorWidget,
  CopilotVoiceFab,
  isCopilotRiverPathname,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import {
  AppLayout,
  type AppLayoutProps,
  CopilotPathProvider,
  CopilotRailDockAnchor,
  latestAppMenuSpaces,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { NotificationBell } from "@engenty/notifications-ui";
import type {
  UiContributions,
  WorkspaceSpace,
  WorkspaceTenant,
} from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AppMenuSpacePanel } from "@/components/app-menu/app-menu-space-panel";
import { SidebarUserMenu } from "@/components/layout/SidebarUserMenu";
import { NavigationPrefetchRoot } from "@/components/navigation-prefetch-root";
import { SettingsAboutFooter } from "@/components/settings/SettingsAboutFooter";
import {
  SpaceNavCrumbSlot,
  SpaceNavFooterSlot,
  SpaceNavLeadingSlot,
  SpaceNavTitleSlot,
} from "@/components/spaces/SpaceShellNavSlots";
import { SpacesRailZone } from "@/components/spaces/SpacesRailZone";
import { CopilotRiverLocationSync } from "@/copilot/copilot-river-location-sync";
import { CopilotShellUiHost } from "@/copilot/copilot-shell-ui-host";
import { GuideOverlayHostWithBridge } from "@/copilot/guide-overlay-host-with-bridge";
import { isModuleHubChatRoute } from "@/lib/module-chat-routes";
import { spaceNavLevel } from "@/lib/space-nav";
import { spacePlacedModuleIds } from "@/lib/space-route-mirrors";
import {
  parseModulePath,
  parseSpacePath,
  spaceRootPath,
} from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpacesRecent } from "@/lib/spaces-recent-persistence";
import { rememberedSpaceKey, useRouteSpace } from "@/lib/use-route-space";
import { AuthenticatedRoutes } from "@/routes/AuthenticatedRoutes";

export function AppLocationChrome({
  appBarPositionPersistence,
  appBarThemes,
  appMenuActions,
  appVersion,
  brandLogoUrl,
  brandName,
  contributions,
  fetchResolvedFeatureFlags,
  onAboutClick,
  onModulesReorder,
  planLabel,
  secondaryNavPersistence,
  sections,
  workspace,
}: {
  appBarPositionPersistence: AppLayoutProps["appBarPositionPersistence"];
  appBarThemes: AppLayoutProps["appBarThemes"];
  appMenuActions: AppLayoutProps["appMenuActions"];
  appVersion: string;
  brandLogoUrl?: string;
  brandName: string;
  contributions: UiContributions;
  fetchResolvedFeatureFlags: AppLayoutProps["fetchResolvedFeatureFlags"];
  onAboutClick: () => void;
  onModulesReorder: (orderedIds: string[]) => void;
  planLabel: string;
  secondaryNavPersistence: AppLayoutProps["secondaryNavPersistence"];
  sections: AppLayoutProps["sections"];
  workspace: {
    currentSpace: WorkspaceSpace | null;
    currentTenant: WorkspaceTenant | null;
    isSuperAdmin: boolean;
    isTenantAdmin: boolean;
    userId: string;
  };
}) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const routeSpace = useRouteSpace(workspace.currentSpace);
  const spacePath = parseSpacePath(location.pathname);
  const spacesQuery = useSpacesQuery();
  const { recent } = useSpacesRecent({ enabled: true });
  const appMenuSpaces = useMemo(
    () =>
      latestAppMenuSpaces({
        currentKey: spacePath?.spaceKey ?? null,
        recentIds: recent,
        spaces: (spacesQuery.data ?? []).map((space) => ({
          color: space.color,
          icon: space.icon,
          id: space.id,
          key: space.key,
          name: space.name,
        })),
      }),
    [recent, spacePath?.spaceKey, spacesQuery.data]
  );
  const spacePlacedModules = useMemo(
    () => spacePlacedModuleIds(contributions.adminMenuItems),
    [contributions.adminMenuItems]
  );
  const inFlightSpaceNav = useMemo(() => {
    if (spacePath) {
      return null;
    }
    const legacy = parseModulePath(location.pathname);
    if (!(legacy && spacePlacedModules.has(legacy.moduleId))) {
      return null;
    }
    const spaceKey = rememberedSpaceKey();
    return spaceKey ? { moduleId: legacy.moduleId, spaceKey } : null;
  }, [location.pathname, spacePath, spacePlacedModules]);
  const spaceNav = spacePath
    ? {
        moduleId: spacePath.moduleId,
        segment: spacePath.segment,
        spaceKey: spacePath.spaceKey,
      }
    : inFlightSpaceNav
      ? { ...inFlightSpaceNav, segment: inFlightSpaceNav.moduleId }
      : null;
  const spaceColumnLevel = useMemo(() => {
    if (!spaceNav) {
      return null;
    }
    return spaceNavLevel(spaceNav.moduleId, contributions.spaceTabs ?? []);
  }, [contributions.spaceTabs, spaceNav]);
  const spaceNavTransition = useMemo(() => {
    if (!(spaceNav && spaceColumnLevel)) {
      return null;
    }
    return {
      enterFrom:
        spaceColumnLevel === "module" ? ("right" as const) : ("left" as const),
      key: `${spaceNav.spaceKey}:${spaceColumnLevel}`,
    };
  }, [spaceColumnLevel, spaceNav]);

  const isSuperAdmin = workspace.isSuperAdmin;
  const isTenantAdmin = workspace.isTenantAdmin;
  const chromeHidden =
    isCopilotRiverPathname(location.pathname) ||
    isModuleHubChatRoute(location.pathname);
  const onSettingsChrome =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/setup");

  return (
    <CopilotPathProvider
      chromeHidden={chromeHidden}
      pathname={location.pathname}
    >
      <CopilotRiverLocationSync />
      <AppLayout
        appBarPositionPersistence={appBarPositionPersistence}
        appBarThemes={appBarThemes}
        appMenu={{
          labels: {
            about: t("sidebar.appMenu.about"),
            actions: t("sidebar.appMenu.actions"),
            all: t("sidebar.appMenu.all"),
            empty: t("sidebar.appMenu.empty"),
            loading: t("sidebar.appMenu.loading"),
            search: t("sidebar.appMenu.search"),
            settings: t("sidebar.appMenu.settings"),
            spaceEmpty: t("sidebar.appMenu.spaceEmpty"),
          },
          onAbout: onAboutClick,
          renderSpace: (space, navigate) => (
            <AppMenuSpacePanel onNavigate={navigate} space={space} />
          ),
          spaces: appMenuSpaces,
        }}
        appMenuActions={appMenuActions}
        currentSpace={routeSpace}
        currentTenant={workspace.currentTenant}
        currentUserId={workspace.userId}
        defaultTopbarTitle={t("navigation.dashboard")}
        fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
        isSuperAdmin={isSuperAdmin}
        isTenantAdmin={isTenantAdmin}
        modulesReorderable={isTenantAdmin || isSuperAdmin}
        onModulesReorder={onModulesReorder}
        railCopilotSlot={<CopilotRailDockAnchor label={t("copilot.title")} />}
        railEndSlot={<NotificationBell />}
        secondaryNavFooterSlot={
          spaceNav ? (
            <SpaceNavFooterSlot
              moduleId={spaceNav.moduleId}
              spaceKey={spaceNav.spaceKey}
            />
          ) : onSettingsChrome ? (
            <SettingsAboutFooter
              aboutLabel={t("sidebar.appMenu.about")}
              appVersion={appVersion}
              brandLabel={brandName}
              logoUrl={brandLogoUrl}
              onAboutClick={onAboutClick}
              planLabel={planLabel}
            />
          ) : undefined
        }
        secondaryNavHeaderOverride={
          spaceNav ? (
            <SpaceNavTitleSlot spaceKey={spaceNav.spaceKey} />
          ) : undefined
        }
        secondaryNavLeadingSlot={
          spaceNav ? (
            <SpaceNavLeadingSlot
              moduleId={spaceNav.moduleId}
              segment={spaceNav.segment}
              spaceKey={spaceNav.spaceKey}
            />
          ) : undefined
        }
        secondaryNavPersistence={secondaryNavPersistence}
        secondaryNavRouteBreadcrumb={
          spaceNav
            ? {
                compactKept: true,
                label: <SpaceNavCrumbSlot spaceKey={spaceNav.spaceKey} />,
                menuLabel: routeSpace?.name ?? spaceNav.spaceKey,
                to: spaceRootPath(spaceNav.spaceKey),
              }
            : null
        }
        secondaryNavRouteTransition={spaceNavTransition ?? undefined}
        sections={sections}
        shell={{
          appSubtitle: planLabel,
          appTitle: t("sidebar.brand"),
          searchPlaceholder: t("sidebar.search", {
            context: "placeholder",
          }),
          searchShortcut: "K",
          userMenu: (compact) => <SidebarUserMenu compact={compact} />,
        }}
        shellUiHost={
          <>
            <CopilotShellUiHost />
            <GuideOverlayHostWithBridge />
            {/* Inside the layout's WorkspaceProvider: the inspector's
                superadmin gate reads it, and outside it read false. */}
            <AgUiAgentInspectorWidget
              serviceBaseUrl={resolveEngentyAiServiceBaseUrl() ?? ""}
            />
          </>
        }
        spacesZone={<SpacesRailZone />}
      >
        <NavigationPrefetchRoot
          navigationPrefetch={contributions.navigationPrefetch}
        />
        <AuthenticatedRoutes
          contributions={contributions}
          isSuperAdmin={isSuperAdmin}
          isTenantAdmin={isTenantAdmin}
        />
      </AppLayout>
      <CopilotVoiceFab hidden={chromeHidden} />
    </CopilotPathProvider>
  );
}
