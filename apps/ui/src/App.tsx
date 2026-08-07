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
  CopilotShellProvider,
  useAgentUiFrontendToolExecutor,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
} from "@engenty/app-shell";
import { applyDockModuleOrder } from "@engenty/app-shell/navigation";
import {
  gateFailureToNavigationState,
  getSupabaseAuthClient,
  refreshSupabaseAuthSession,
  ServiceUnavailablePage,
  useCoreAuthSession,
} from "@engenty/auth-ui";
import { isFullPageCopilotChatRoute } from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import type { UiBrandInfo } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { AboutDialog } from "@/components/AboutDialog";
import { AppErrorCard } from "@/components/AppErrorCard";
import { AppearanceBootstrap } from "@/components/AppearanceBootstrap";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { BrandProbe } from "@/components/BrandProbe";
import { SidebarUserMenu } from "@/components/layout/SidebarUserMenu";
import { LiveDataSync } from "@/components/live-data-sync";
import { NavigationPrefetchRoot } from "@/components/navigation-prefetch-root";
import { AppActiveCopilotProvider } from "@/copilot/app-active-copilot-provider";
import { CopilotShellUiHost } from "@/copilot/copilot-shell-ui-host";
import { GuideOverlayHostWithBridge } from "@/copilot/guide-overlay-host-with-bridge";
import { DesktopBridge } from "@/desktop/DesktopBridge";
import { useAppMenuActions } from "@/hooks/use-app-menu-actions";
import { switchCurrentTenant } from "@/lib/api/client";
import { useCopilotLayoutPersistence } from "@/lib/copilot-layout-persistence";
import { buildLiveBindingMaps } from "@/lib/live-bindings";
import { isModuleHubChatRoute } from "@/lib/module-chat-routes";
import { useShellDockModuleOrderPersistence } from "@/lib/shell-dock-module-order-persistence";
import { useShellSecondaryNavPinnedPersistence } from "@/lib/shell-secondary-nav-pinned-persistence";
import { useAuthenticatedAppBootstrap } from "@/lib/use-authenticated-app-bootstrap";
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

  return (
    <EngentyAI
      agentToolInvalidation={agentToolInvalidation}
      executeFrontendTool={executeFrontendTool}
      formatRequestError={formatCopilotRunError}
      frontendTools={frontendTools}
      queryClient={queryClient}
      resolveKbArticleHref={resolveKbArticleHref}
      serviceBaseUrl={serviceBaseUrl}
      stateSnapshot={stateSnapshot}
      tenantId={tenantId}
      threadsRealtimeClient={getSupabaseAuthClient()}
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
  const navigate = useNavigate();
  const { isAuthenticated, loading, error } = useCoreAuthSession();
  const queryClient = useQueryClient();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [brand, setBrand] = useState<UiBrandInfo>({});
  const appVersion = import.meta.env.VITE_APP_VERSION ?? "";
  const isPortalPath = location.pathname.startsWith("/portal/");
  const publicContributions = usePublicUiPluginContributions(
    !(loading || isAuthenticated) || isPortalPath
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

  // Brand shown in the sidebar switcher + About dialog. A module (company-profile)
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

  const dockModuleOrderPersistence = useShellDockModuleOrderPersistence({
    enabled: shellPersistenceEnabled,
    tenantId: workspaceContext?.currentTenant?.id ?? "",
  });

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

  if (onboardingError) {
    return (
      <AppErrorCard
        message={onboardingError}
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

  // Portal paths render without the app shell for a neutral/standalone look
  if (isPortalPath) {
    if (!publicContributions.ready) {
      return <AppLoadingScreen message={t("shell.loading")} shimmer />;
    }
    return (
      <>
        <AppearanceBootstrap
          resolvedAppearance={workspaceContext.resolvedAppearance}
        />
        <UnauthenticatedRoutes
          contributions={publicContributions.contributions}
        />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  return (
    <>
      <AppearanceBootstrap
        resolvedAppearance={workspaceContext.resolvedAppearance}
      />
      <CopilotShellProvider
        copilotLayout={copilotLayoutPersistence}
        defaultDockMode="mini-floating"
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
            <DesktopBridge
              sections={orderedSections}
              tenantId={workspaceContext.currentTenant?.id ?? ""}
            />
            {contributions.backgroundComponents.map((entry) => (
              <entry.component key={entry.id} />
            ))}
            {contributions.brandSource && (
              <BrandProbe
                onChange={handleBrandChange}
                useBrand={contributions.brandSource}
              />
            )}
            <AppLayout
              appMenuActions={appMenuActions}
              currentUserId={workspaceContext.userId}
              defaultTopbarTitle={t("navigation.dashboard")}
              fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
              modulesReorderable={isTenantAdmin || isSuperAdmin}
              onModulesReorder={dockModuleOrderPersistence.setOrder}
              secondaryNavPersistence={secondaryNavPersistence}
              sections={orderedSections}
              shell={{
                appTitle: t("sidebar.brand"),
                appSubtitle: workspaceContext.planLabel || t("sidebar.plan"),
                searchPlaceholder: t("sidebar.search", {
                  context: "placeholder",
                }),
                searchShortcut: "K",
                userMenu: (compact) => <SidebarUserMenu compact={compact} />,
                tenantSwitcher: {
                  currentTenant: workspaceContext.currentTenant,
                  availableTenants: workspaceContext.tenants,
                  canSwitchTenant:
                    workspaceContext.canSwitchTenant && isSuperAdmin,
                  onSwitchTenant: async (tenantId: string) => {
                    await switchCurrentTenant(tenantId);
                    try {
                      await refreshSupabaseAuthSession();
                    } catch {
                      toast.error(
                        "Tenant switched, but live updates need a fresh sign-in. Please reload or sign in again."
                      );
                    }
                    await queryClient.invalidateQueries({
                      queryKey: ["workspace-context"],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["tasks"],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["engenty-copilot", "agent-sessions"],
                    });
                  },
                  brandLabel: brandName,
                  logoUrl: brandLogoUrl,
                  planLabel: workspaceContext.planLabel || t("sidebar.plan"),
                  noTenantLabel: t("sidebar.tenantSwitcher.noTenant"),
                  switchTenantAriaLabel: t("sidebar.appMenu.aria"),
                  appVersion,
                  settingsLabel: t("sidebar.appMenu.settings"),
                  onOpenSettings: () => navigate("/settings"),
                  aboutLabel: t("sidebar.appMenu.about"),
                  onAboutClick: () => setAboutOpen(true),
                },
              }}
              shellUiHost={
                <>
                  <CopilotShellUiHost />
                  <GuideOverlayHostWithBridge />
                </>
              }
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
