import {
  AgUiAgentInspectorWidget,
  CopilotVoiceFab,
  EngentyAI,
  formatCopilotRunError,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { ApiClientResponseError } from "@engenty/api-client";
import { ENGENTY_SERVICE_ERROR_CODES } from "@engenty/api-contracts";
import {
  AppLayout,
  CopilotRailDockAnchor,
  CopilotShellProvider,
  useAgentUiFrontendToolExecutor,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
} from "@engenty/app-shell";
import { applyDockModuleOrder } from "@engenty/app-shell/navigation";
import {
  gateFailureToNavigationState,
  getSupabaseAuthClient,
  ServiceUnavailablePage,
  useCoreAuthSession,
} from "@engenty/auth-ui";
import { isFullPageCopilotChatRoute } from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import type { PostgresChangeRealtimeClient } from "@engenty/live-cache";
import { NotificationBell } from "@engenty/notifications-ui";
import { useQueryClient } from "@engenty/query-client";
import {
  type UiBrandInfo,
  UiContributionsProvider,
} from "@engenty/ui-plugin-sdk";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AboutDialog } from "@/components/AboutDialog";
import { AppErrorCard } from "@/components/AppErrorCard";
import { AppearanceBootstrap } from "@/components/AppearanceBootstrap";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { BrandProbe } from "@/components/BrandProbe";
import { SidebarUserMenu } from "@/components/layout/SidebarUserMenu";
import { LiveDataSync } from "@/components/live-data-sync";
import { NavigationPrefetchRoot } from "@/components/navigation-prefetch-root";
import { SettingsAboutFooter } from "@/components/settings/SettingsAboutFooter";
import {
  SpaceNavCrumbSlot,
  SpaceNavFooterSlot,
  SpaceNavLeadingSlot,
  SpaceNavTitleSlot,
} from "@/components/spaces/SpaceShellNavSlots";
import { SpacesRailZone } from "@/components/spaces/SpacesRailZone";
import { AppActiveCopilotProvider } from "@/copilot/app-active-copilot-provider";
import { CopilotShellUiHost } from "@/copilot/copilot-shell-ui-host";
import { GuideOverlayHostWithBridge } from "@/copilot/guide-overlay-host-with-bridge";
import { useCopilotSpaceId } from "@/copilot/use-copilot-space-id";
import { DesktopBridge } from "@/desktop/DesktopBridge";
import { useAppMenuActions } from "@/hooks/use-app-menu-actions";
import { useCopilotLayoutPersistence } from "@/lib/copilot-layout-persistence";
import { buildLiveBindingMaps } from "@/lib/live-bindings";
import { isModuleHubChatRoute } from "@/lib/module-chat-routes";
import { useShellAppBarPositionPersistence } from "@/lib/shell-app-bar-position-persistence";
import { useShellDockModuleOrderPersistence } from "@/lib/shell-dock-module-order-persistence";
import { useShellSecondaryNavPinnedPersistence } from "@/lib/shell-secondary-nav-pinned-persistence";
import { spaceNavLevel } from "@/lib/space-nav";
import { spacePlacedModuleIds } from "@/lib/space-route-mirrors";
import {
  parseModulePath,
  parseSpacePath,
  spaceRootPath,
} from "@/lib/space-routes";
import { useAuthenticatedAppBootstrap } from "@/lib/use-authenticated-app-bootstrap";
import { rememberedSpaceKey, useRouteSpace } from "@/lib/use-route-space";
import { usePublicUiPluginContributions } from "@/plugins/public-ui-plugin-contributions";
import { AuthenticatedRoutes } from "@/routes/AuthenticatedRoutes";
import { UnauthenticatedRoutes } from "@/routes/UnauthenticatedRoutes";

function EngentyAiShellProvider({
  agentToolInvalidation,
  children,
  resolveKbArticleHref,
  serviceBaseUrl,
  tenantId,
  userId,
}: {
  agentToolInvalidation: ReturnType<
    typeof buildLiveBindingMaps
  >["agentToolInvalidationMap"];
  children: ReactNode;
  resolveKbArticleHref?: (slug: string, articleIdOrSlug: string) => string;
  serviceBaseUrl: string;
  tenantId: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const frontendTools = useAgentUiFrontendTools();
  const executeFrontendTool = useAgentUiFrontendToolExecutor();
  const stateSnapshot = useAgentUiStateSnapshot();
  // Which space the copilot's PERSISTED active thread is remembered under.
  // Same answer the binding provider files new threads with, from one hook, so
  // the dock cannot resume Company's chat while standing in Marketing
  // (PLAN-space-chats.md).
  const copilotSpaceId = useCopilotSpaceId();

  return (
    <EngentyAI
      activeThreadSpaceId={copilotSpaceId}
      agentToolInvalidation={agentToolInvalidation}
      executeFrontendTool={executeFrontendTool}
      formatRequestError={formatCopilotRunError}
      frontendTools={frontendTools}
      queryClient={queryClient}
      resolveKbArticleHref={resolveKbArticleHref}
      serviceBaseUrl={serviceBaseUrl}
      stateSnapshot={stateSnapshot}
      tenantId={tenantId}
      threadsRealtimeClient={
        // Structurally compatible at runtime; live-cache's minimal interface
        // exists precisely so this file does not import supabase-js types.
        getSupabaseAuthClient() as unknown as PostgresChangeRealtimeClient
      }
      userId={userId}
    >
      {children}
    </EngentyAI>
  );
}

function workspaceErrorToServiceUnavailableState(error: unknown) {
  if (!(error instanceof ApiClientResponseError)) {
    return null;
  }

  if (error.code === ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE) {
    return {
      reason: "database_unavailable" as const,
      error_code: error.code,
      message: error.message,
    };
  }

  if (error.code === ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE) {
    return {
      reason: "api_unreachable" as const,
      error_code: error.code,
      message: error.message,
      ...(error.status > 0 ? { http_status: error.status } : {}),
    };
  }

  return null;
}

function App() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const { isAuthenticated, loading, error } = useCoreAuthSession();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [brand, setBrand] = useState<UiBrandInfo>({});
  const appVersion = import.meta.env.VITE_APP_VERSION ?? "";
  const isPortalPath = location.pathname.startsWith("/portal/");
  const isOAuthConsentPath =
    location.pathname === "/oauth/consent" ||
    location.pathname.startsWith("/oauth/consent/");
  const isAuthPath =
    location.pathname === "/auth" || location.pathname.startsWith("/auth/");
  // Standalone public surfaces: skip the authenticated shell/onboarding even
  // when a session already exists (MCP OAuth consent + login must not boot the app).
  const isStandalonePublicPath =
    isPortalPath || isOAuthConsentPath || isAuthPath;
  const publicContributions = usePublicUiPluginContributions(
    !(loading || isAuthenticated) || isStandalonePublicPath
  );

  const {
    onboardingReady,
    onboardingError,
    serviceAvailabilityFailure,
    workspaceQuery,
    workspaceContext,
    contributions,
    pluginsReady,
    sections,
    fetchResolvedFeatureFlags,
  } = useAuthenticatedAppBootstrap(isAuthenticated);

  const { agentToolInvalidationMap, liveCacheBindings } = useMemo(
    () => buildLiveBindingMaps(contributions.liveBindings),
    [contributions.liveBindings]
  );

  // Brand shown in the About footer + About dialog. A module (company-profile)
  // contributes the tenant's own name/logo via `brandSource`; fall back to the
  // product brand when none is set.
  const handleBrandChange = useCallback(
    (next: UiBrandInfo) => setBrand(next),
    []
  );
  const brandName = brand.name?.trim() || t("sidebar.brand");
  const brandLogoUrl = brand.logoUrl ?? undefined;

  const shellPersistenceEnabled =
    isAuthenticated &&
    onboardingReady &&
    pluginsReady &&
    !workspaceQuery.error &&
    !!workspaceContext;

  const copilotLayoutPersistence = useCopilotLayoutPersistence({
    enabled: shellPersistenceEnabled,
  });

  const secondaryNavPersistence = useShellSecondaryNavPinnedPersistence({
    enabled: shellPersistenceEnabled,
  });

  const appBarPositionPersistence = useShellAppBarPositionPersistence({
    enabled: shellPersistenceEnabled,
  });

  const dockModuleOrderPersistence = useShellDockModuleOrderPersistence({
    enabled: shellPersistenceEnabled,
    tenantId: workspaceContext?.currentTenant?.id ?? "",
  });

  // The URL decides which space the shell and every module are in; the server's
  // default space is only the fallback outside `/s/…`. Resolved above the
  // loading guard because it is a hook.
  const routeSpace = useRouteSpace(workspaceContext?.currentSpace ?? null);

  // Inside a space, the shell's secondary column belongs to the SPACE: it names
  // it on Work/Data/Plan and its tabs sit above whatever the open module
  // contributes (PLAN-spaces.md Phase 5a). Switching is the rail. One column,
  // two levels — which is how "no surface shows two sidebars" is honoured
  // without asking any module to change. Read from the URL, not from
  // `routeSpace`: that falls back to the tenant default outside `/s/…`, so it
  // is truthy everywhere and cannot tell us which routes are space routes.
  const spacePath = parseSpacePath(location.pathname);

  // Hold the space chrome across the `/mdl/…` hop.
  //
  // Modules build their internal links from an absolute `/mdl/<module>` base —
  // `TasksRedirectPage` sends `/s/<key>/tasks` to `/mdl/tasks/briefing` — so a
  // click inside a space leaves it for a frame or two before LegacyModuleRedirect
  // lands it back. Without this the column unmounts and remounts in that gap and
  // the content jumps left and back, which is what read as a page reload.
  //
  // Gated on the module being SPACE-PLACED, because only those redirect: a global
  // app like the inbox stays at `/mdl/` and must not borrow a space's sidebar
  // just because the user visited one earlier.
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
        // The raw segment, so the space's OWN pages (Data, settings) can read
        // as active. `moduleId` is deliberately undefined for those.
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

  // Which way the column slides needs no history: going deeper always lands on
  // the module level and coming back always lands on the space level, so the
  // destination alone says the direction.
  const spaceNavTransition = useMemo(() => {
    if (!(spaceNav && spaceColumnLevel)) {
      return null;
    }
    return {
      enterFrom:
        spaceColumnLevel === "module" ? ("right" as const) : ("left" as const),
      // Keyed on the level, not the module: moving between two Work modules is
      // a change of contents, not of level, and re-playing the slide there
      // would animate something the user did not experience as a step.
      key: `${spaceNav.spaceKey}:${spaceColumnLevel}`,
    };
  }, [spaceColumnLevel, spaceNav]);

  const orderedSections = useMemo(
    () =>
      applyDockModuleOrder(
        sections,
        dockModuleOrderPersistence.snapshot?.order
      ),
    [sections, dockModuleOrderPersistence.snapshot?.order]
  );

  const appMenuActions = useAppMenuActions();

  if (loading) {
    return <AppLoadingScreen message={t("shell.loading")} shimmer />;
  }

  if (error) {
    return (
      <AppErrorCard
        envPre={
          <>
            VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...
            VITE_API_BASE_URL=...
          </>
        }
        hint={t("shell.envHint")}
        message={error}
        offerSignOut
        title={t("shell.authSetupRequired")}
      />
    );
  }

  if (!isAuthenticated) {
    if (publicContributions.error) {
      const message =
        publicContributions.error instanceof Error
          ? publicContributions.error.message
          : "Failed to load public plugin contributions.";
      return (
        <AppErrorCard
          message={message}
          title="Public plugin bootstrap failed"
        />
      );
    }
    if (!publicContributions.ready) {
      return <AppLoadingScreen message={t("shell.loading")} shimmer />;
    }
    return (
      <UnauthenticatedRoutes
        contributions={publicContributions.contributions}
      />
    );
  }

  // MCP OAuth consent (and portals) must not wait on workspace onboarding or
  // mount the app shell — they are standalone public surfaces even with a
  // live session (Supabase redirects here with only `authorization_id`).
  if (isStandalonePublicPath) {
    if (!publicContributions.ready) {
      return <AppLoadingScreen message={t("shell.loading")} shimmer />;
    }
    return (
      <>
        <UnauthenticatedRoutes
          contributions={publicContributions.contributions}
        />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  if (onboardingError) {
    return (
      <AppErrorCard
        message={onboardingError}
        offerSignOut
        title={t("shell.authSetupRequired")}
      />
    );
  }

  if (serviceAvailabilityFailure) {
    return (
      <ServiceUnavailablePage
        initialState={gateFailureToNavigationState(serviceAvailabilityFailure)}
      />
    );
  }

  if (!onboardingReady) {
    return <AppLoadingScreen message={t("shell.finalizingOnboarding")} />;
  }

  if (!pluginsReady) {
    return <AppLoadingScreen message={t("shell.loading")} shimmer />;
  }

  if (workspaceQuery.error) {
    const serviceUnavailableState = workspaceErrorToServiceUnavailableState(
      workspaceQuery.error
    );
    if (serviceUnavailableState) {
      return <ServiceUnavailablePage initialState={serviceUnavailableState} />;
    }
    const message =
      workspaceQuery.error instanceof Error
        ? workspaceQuery.error.message
        : t("shell.onboardingFailed");
    return (
      <AppErrorCard message={message} title={t("shell.authSetupRequired")} />
    );
  }

  if (workspaceQuery.isLoading || !workspaceContext) {
    return <AppLoadingScreen message={t("shell.loading")} shimmer />;
  }

  const isSuperAdmin = workspaceContext.isSuperAdmin;
  const isTenantAdmin = workspaceContext.isTenantAdmin;
  const aiServiceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";
  const onSettingsChrome =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/setup");

  return (
    <>
      <AppearanceBootstrap
        resolvedAppearance={workspaceContext.resolvedAppearance}
      />
      <CopilotShellProvider
        copilotLayout={copilotLayoutPersistence}
        hideCopilotChrome={
          isFullPageCopilotChatRoute(location.pathname) ||
          isModuleHubChatRoute(location.pathname)
        }
        pathname={location.pathname}
      >
        <EngentyAiShellProvider
          agentToolInvalidation={agentToolInvalidationMap}
          resolveKbArticleHref={contributions.copilotArticleHrefResolver}
          serviceBaseUrl={aiServiceBaseUrl}
          tenantId={workspaceContext.currentTenant?.id ?? ""}
          userId={workspaceContext.userId}
        >
          <AppActiveCopilotProvider
            tenantId={workspaceContext.currentTenant?.id ?? ""}
            userId={workspaceContext.userId}
          >
            <LiveDataSync
              bindings={liveCacheBindings}
              tenantId={workspaceContext.currentTenant?.id ?? ""}
              userId={workspaceContext.userId}
            />
            <DesktopBridge sections={orderedSections} />
            {contributions.backgroundComponents.map((entry) => (
              <entry.component key={entry.id} />
            ))}
            {contributions.brandSource && (
              <BrandProbe
                onChange={handleBrandChange}
                useBrand={contributions.brandSource}
              />
            )}
            {/* Wraps the layout, not just the routes: `shellUiHost` mounts the
                copilot beside `AuthenticatedRoutes`, and its `navigate` tool
                needs the route table to check paths against. */}
            <UiContributionsProvider contributions={contributions}>
              <AppLayout
                appBarPositionPersistence={appBarPositionPersistence}
                appMenuActions={appMenuActions}
                currentSpace={routeSpace}
                currentTenant={workspaceContext.currentTenant}
                currentUserId={workspaceContext.userId}
                defaultTopbarTitle={t("navigation.dashboard")}
                fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
                isSuperAdmin={isSuperAdmin}
                isTenantAdmin={isTenantAdmin}
                modulesReorderable={isTenantAdmin || isSuperAdmin}
                onModulesReorder={dockModuleOrderPersistence.setOrder}
                railCopilotSlot={<CopilotRailDockAnchor />}
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
                      onAboutClick={() => setAboutOpen(true)}
                      planLabel={
                        workspaceContext.planLabel || t("sidebar.plan")
                      }
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
                // Collapsed, the column takes the name with it. Put that
                // identity on the trail — tile + name, shrinking to the tile
                // when the path is long or the screen is narrow. Switching
                // stays on the rail.
                secondaryNavRouteBreadcrumb={
                  spaceNav
                    ? {
                        compactKept: true,
                        label: (
                          <SpaceNavCrumbSlot spaceKey={spaceNav.spaceKey} />
                        ),
                        menuLabel: routeSpace?.name ?? spaceNav.spaceKey,
                        to: spaceRootPath(spaceNav.spaceKey),
                      }
                    : null
                }
                secondaryNavRouteTransition={spaceNavTransition ?? undefined}
                sections={orderedSections}
                shell={{
                  appTitle: t("sidebar.brand"),
                  appSubtitle: workspaceContext.planLabel || t("sidebar.plan"),
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
            </UiContributionsProvider>
            <AboutDialog
              brandLabel={t("sidebar.brand")}
              logoUrl={brandLogoUrl}
              onOpenChange={setAboutOpen}
              open={aboutOpen}
              planLabel={workspaceContext.planLabel || t("sidebar.plan")}
              tenantName={workspaceContext.currentTenant?.name}
              version={appVersion}
            />
            <AgUiAgentInspectorWidget serviceBaseUrl={aiServiceBaseUrl} />
            <CopilotVoiceFab
              hidden={
                isFullPageCopilotChatRoute(location.pathname) ||
                isModuleHubChatRoute(location.pathname)
              }
            />
          </AppActiveCopilotProvider>
        </EngentyAiShellProvider>
      </CopilotShellProvider>
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
