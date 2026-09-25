import { AGENTS_WORKSPACE_ROOT_PATH, COPILOT_RIVER_PATH } from "@engenty/ai-ui";
import { NotificationsPage } from "@engenty/notifications-ui";
import {
  type UiContributions,
  UiContributionsProvider,
} from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { SpaceModuleGate } from "@/components/spaces/SpaceModuleGate";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";
import {
  spaceMirroredRoutes,
  spaceMirrorPath,
  spacePlacedModuleIds,
} from "@/lib/space-route-mirrors";
import { CompanyFilesPage } from "@/pages/CompanyFilesPage";
import { CopilotDeskPage } from "@/pages/CopilotDeskPage";
import { DeviceApprovalPage } from "@/pages/DeviceApprovalPage";
import { adminSettingsRoutes } from "@/routes/admin-settings-routes";
import { DefaultPlaceRedirect } from "@/routes/DefaultPlaceRedirect";
import { LegacyModuleRedirect } from "@/routes/LegacyModuleRedirect";
import { spaceAuthenticatedRoutes } from "@/routes/space-authenticated-routes";

interface AuthenticatedRoutesProps {
  contributions: UiContributions;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

// Settings pages that are genuinely per-user (not tenant config) and so stay
// reachable by members even though they live under /settings/* or the
// connections surface under /setup/connections. Appearance is NOT here — it is
// the tenant-wide branding editor (writes tenant settings); members change
// only their own theme/language via the user menu.
const PERSONAL_SETTINGS_PREFIXES = [
  "/settings/profile",
  "/setup/connections",
  "/settings/connections",
];

const SETUP_TENANT_ADMIN_PREFIXES = ["/setup/ai", "/setup/integration-keys"];
const SETUP_PERSONAL_PREFIXES = ["/setup/connections"];

// The Engenty agents workspace (every module page under it, too) is a debugging
// surface: superadmins with developer mode on only. `useDeveloperModeEnabled`
// already carries the superadmin gate.
function isAgentsWorkspacePath(path: string): boolean {
  return pathMatchesPrefix(path, AGENTS_WORKSPACE_ROOT_PATH);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isBlockedSetupPath(
  path: string,
  opts: { isAdmin: boolean; isSuperAdmin: boolean }
): boolean {
  if (
    SETUP_PERSONAL_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))
  ) {
    return false;
  }
  if (
    SETUP_TENANT_ADMIN_PREFIXES.some((prefix) =>
      pathMatchesPrefix(path, prefix)
    )
  ) {
    return !opts.isAdmin;
  }
  if (path === "/setup") {
    return !opts.isAdmin;
  }
  return !opts.isSuperAdmin;
}

export function AuthenticatedRoutes({
  contributions,
  isSuperAdmin,
  isTenantAdmin,
}: AuthenticatedRoutesProps) {
  const developerModeEnabled = useDeveloperModeEnabled();
  const navigate = useNavigate();
  // Tenant admins and superadmins are the "admins"; members are end users who
  // get personal settings + module apps but no tenant-config / admin consoles.
  const isAdmin = isSuperAdmin || isTenantAdmin;

  // Which plugins declared `placement: "space"` — the only ones whose legacy
  // `/mdl/*` links redirect. Read off the menu items because that is where the
  // resolver enriches placement; routes carry only the pluginId.
  const spacePlaced = useMemo(
    () => spacePlacedModuleIds(contributions.adminMenuItems),
    [contributions.adminMenuItems]
  );

  // Clicking a web-push notification focuses this tab; the service worker
  // (public/sw.js notificationclick) posts the target route here.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { route?: string; type?: string } | null;
      if (data?.type === "engenty:navigate" && data.route?.startsWith("/")) {
        navigate(data.route);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  // Built once per contributions/admin change, not on every navigation. A new
  // element for every module route is what made the router reconcile the
  // whole table on a space switch.
  const pluginRoutes = useMemo(
    () =>
      contributions.routes.map((pluginRoute) => {
        const PluginPage = pluginRoute.component;
        const isPersonalSettings = PERSONAL_SETTINGS_PREFIXES.some((prefix) =>
          pluginRoute.path.startsWith(prefix)
        );
        const isSetupPath =
          pluginRoute.path === "/setup" ||
          pluginRoute.path.startsWith("/setup/");
        const defaultAdminOnly =
          pluginRoute.path.startsWith("/admin/") ||
          isSetupPath ||
          (pluginRoute.path.startsWith("/settings/") && !isPersonalSettings);
        const adminOnly = pluginRoute.requiresAdmin ?? defaultAdminOnly;
        let blocked = adminOnly && !isAdmin;
        if (isSetupPath) {
          blocked = isBlockedSetupPath(pluginRoute.path, {
            isAdmin,
            isSuperAdmin,
          });
        } else if (isAgentsWorkspacePath(pluginRoute.path)) {
          blocked = !developerModeEnabled;
        }
        const element = blocked ? <DefaultPlaceRedirect /> : <PluginPage />;
        const redirects =
          !blocked &&
          spaceMirrorPath(pluginRoute.path) !== null &&
          spacePlaced.has(pluginRoute.pluginId);
        return (
          <Route
            element={
              redirects ? (
                <LegacyModuleRedirect Fallback={PluginPage} />
              ) : (
                element
              )
            }
            key={pluginRoute.id}
            path={pluginRoute.path}
          />
        );
      }),
    [
      contributions.routes,
      developerModeEnabled,
      isAdmin,
      isSuperAdmin,
      spacePlaced,
    ]
  );

  const mirroredSpaceRoutes = useMemo(
    () =>
      spaceMirroredRoutes(contributions.routes)
        .filter(({ route }) => !(route.requiresAdmin && !isAdmin))
        .flatMap(({ legacyPath, path, route }) => {
          const PluginPage = route.component;
          const element = (
            <SpaceModuleGate key={route.id} moduleId={route.pluginId}>
              <PluginPage />
            </SpaceModuleGate>
          );
          return [
            <Route element={element} key={route.id} path={path} />,
            ...(legacyPath
              ? [
                  <Route
                    element={element}
                    key={`${route.id}:legacy`}
                    path={legacyPath}
                  />,
                ]
              : []),
          ];
        }),
    [contributions.routes, isAdmin]
  );

  return (
    <UiContributionsProvider contributions={contributions}>
      <Routes>
        <Route element={<DefaultPlaceRedirect />} path="/" />
        <Route
          element={<Navigate replace to="/mdl/dashboard" />}
          path="/dashboard"
        />
        {/* The river outside any space. */}
        <Route element={<CopilotDeskPage />} path={COPILOT_RIVER_PATH} />
        <Route element={<DeviceApprovalPage />} path="/auth/device" />
        <Route element={<NotificationsPage />} path="/notifications" />
        <Route element={<CompanyFilesPage />} path="/company" />
        {adminSettingsRoutes({
          developerModeEnabled,
          isAdmin,
          isSuperAdmin,
        })}
        <Route element={<DefaultPlaceRedirect />} path="/initial_setup" />
        <Route element={<DefaultPlaceRedirect />} path="/auth/login" />
        <Route element={<DefaultPlaceRedirect />} path="/auth/callback" />
        {pluginRoutes}
        {/* Everything inside a space. The Work/Data/Plan tabs live in the shell's
            secondary column (App.tsx `secondaryNavLeadingSlot`), so a module
            opened here keeps them and contributes its own nav directly below —
            one column, never two. Module components are the SAME ones registered
            at `/mdl/…`; they are mounted a second time and read the space from
            WorkspaceContext.currentSpace, which follows the URL. */}
        {spaceAuthenticatedRoutes({ isAdmin, mirroredSpaceRoutes })}
        <Route element={<DefaultPlaceRedirect />} path="*" />
      </Routes>
    </UiContributionsProvider>
  );
}
