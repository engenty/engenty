import {
  EngentyAI,
  formatCopilotRunError,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { ApiClientResponseError } from "@engenty/api-client";
import { ENGENTY_SERVICE_ERROR_CODES } from "@engenty/api-contracts";
import {
  CopilotShellProvider,
  useAgentUiFrontendToolExecutor,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshotGetter,
} from "@engenty/app-shell";
import { applyDockModuleOrder } from "@engenty/app-shell/navigation";
import {
  gateFailureToNavigationState,
  getSupabaseAuthClient,
  ServiceUnavailablePage,
  useCoreAuthSession,
} from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import type { PostgresChangeRealtimeClient } from "@engenty/live-cache";
import { useQueryClient } from "@engenty/query-client";
import {
  type UiBrandInfo,
  UiContributionsProvider,
} from "@engenty/ui-plugin-sdk";
import { memo, type ReactNode, useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLocationChrome } from "@/app-location-chrome";
import { AboutDialog } from "@/components/AboutDialog";
import { AppErrorCard } from "@/components/AppErrorCard";
import { AppearanceBootstrap } from "@/components/AppearanceBootstrap";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { BrandProbe } from "@/components/BrandProbe";
import { LiveDataSync } from "@/components/live-data-sync";
import { NotificationToastChannel } from "@/components/NotificationToastChannel";
import { AppActiveCopilotProvider } from "@/copilot/app-active-copilot-provider";
import { DesktopBridge } from "@/desktop/DesktopBridge";
import { useAppBarThemeMenu } from "@/hooks/use-app-bar-theme-menu";
import { useAppMenuActions } from "@/hooks/use-app-menu-actions";
import { useCopilotLayoutPersistence } from "@/lib/copilot-layout-persistence";
import { buildLiveBindingMaps } from "@/lib/live-bindings";
import { useShellAppBarPositionPersistence } from "@/lib/shell-app-bar-position-persistence";
import { useShellDockModuleOrderPersistence } from "@/lib/shell-dock-module-order-persistence";
import { useShellSecondaryNavPinnedPersistence } from "@/lib/shell-secondary-nav-pinned-persistence";
import { useAuthenticatedAppBootstrap } from "@/lib/use-authenticated-app-bootstrap";
import { usePublicUiPluginContributions } from "@/plugins/public-ui-plugin-contributions";
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
  const getStateSnapshot = useAgentUiStateSnapshotGetter();
  // Which space the copilot's PERSISTED active thread is remembered under.
  return (
    <EngentyAI
      agentToolInvalidation={agentToolInvalidation}
      executeFrontendTool={executeFrontendTool}
      formatRequestError={formatCopilotRunError}
      frontendTools={frontendTools}
      getStateSnapshot={getStateSnapshot}
      queryClient={queryClient}
      resolveKbArticleHref={resolveKbArticleHref}
      serviceBaseUrl={serviceBaseUrl}
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

/**
 * Authenticated app, deliberately not subscribed to the router.
 *
 * `App` below reads the URL only to choose this tree or a public surface.
 * `memo` then bails out on a space switch, so copilot, AI, and live-sync stay
 * mounted. The frame that does read the path is `AppLocationChrome`.
 */
const AuthenticatedShell = memo(function AuthenticatedShell() {
  const { t } = useTranslation("common");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [brand, setBrand] = useState<UiBrandInfo>({});
  const appVersion = import.meta.env.VITE_APP_VERSION ?? "";

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
  } = useAuthenticatedAppBootstrap(true);

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

  // Tenant colours: admins only, like the Appearance page that owns them.
  const appBarThemes = useAppBarThemeMenu({
    enabled:
      shellPersistenceEnabled &&
      Boolean(
        workspaceContext?.isTenantAdmin || workspaceContext?.isSuperAdmin
      ),
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

  const aiServiceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";
  const planLabel = workspaceContext.planLabel || t("sidebar.plan");

  return (
    <>
      <AppearanceBootstrap
        resolvedAppearance={workspaceContext.resolvedAppearance}
      />
      <CopilotShellProvider copilotLayout={copilotLayoutPersistence}>
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
            <NotificationToastChannel userId={workspaceContext.userId} />
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
              <AppLocationChrome
                appBarPositionPersistence={appBarPositionPersistence}
                appBarThemes={appBarThemes}
                appMenuActions={appMenuActions}
                appVersion={appVersion}
                brandLogoUrl={brandLogoUrl}
                brandName={brandName}
                contributions={contributions}
                fetchResolvedFeatureFlags={fetchResolvedFeatureFlags}
                onAboutClick={() => setAboutOpen(true)}
                onModulesReorder={dockModuleOrderPersistence.setOrder}
                planLabel={planLabel}
                secondaryNavPersistence={secondaryNavPersistence}
                sections={orderedSections}
                workspace={{
                  currentSpace: workspaceContext.currentSpace,
                  currentTenant: workspaceContext.currentTenant,
                  isSuperAdmin: workspaceContext.isSuperAdmin,
                  isTenantAdmin: workspaceContext.isTenantAdmin,
                  userId: workspaceContext.userId,
                }}
              />
            </UiContributionsProvider>
            <AboutDialog
              brandLabel={t("sidebar.brand")}
              logoUrl={brandLogoUrl}
              onOpenChange={setAboutOpen}
              open={aboutOpen}
              planLabel={planLabel}
              tenantName={workspaceContext.currentTenant?.name}
              version={appVersion}
            />
          </AppActiveCopilotProvider>
        </EngentyAiShellProvider>
      </CopilotShellProvider>
      <Toaster position="bottom-right" richColors />
    </>
  );
});

function isStandalonePublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/portal/") ||
    pathname === "/oauth/consent" ||
    pathname.startsWith("/oauth/consent/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

function App() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const { isAuthenticated, loading, error } = useCoreAuthSession();
  const standalone = isStandalonePublicPath(pathname);
  const publicContributions = usePublicUiPluginContributions(
    !(loading || isAuthenticated) || standalone
  );

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

  if (!isAuthenticated || standalone) {
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
      <>
        <UnauthenticatedRoutes
          contributions={publicContributions.contributions}
        />
        {standalone && isAuthenticated ? (
          <Toaster position="bottom-right" richColors />
        ) : null}
      </>
    );
  }

  return <AuthenticatedShell />;
}

export default App;
