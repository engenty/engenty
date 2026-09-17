import {
  AGENTS_WORKSPACE_ROOT_PATH,
  AiGeneralSettingsPage,
} from "@engenty/ai-ui";
import {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
  COPILOT_MODULE_ID,
} from "@engenty/engenty-copilot/paths";
import {
  NotificationStreamsSettingsPage,
  NotificationsPage,
} from "@engenty/notifications-ui";
import {
  type UiContributions,
  UiContributionsProvider,
} from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { SpaceModuleGate } from "@/components/spaces/SpaceModuleGate";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";
import {
  spaceMirroredRoutes,
  spaceMirrorPath,
  spacePlacedModuleIds,
} from "@/lib/space-route-mirrors";
import { AppearanceSettingsPage } from "@/pages/AppearanceSettingsPage";
import { DevelopmentSettingsPage } from "@/pages/DevelopmentSettingsPage";
import { DeviceApprovalPage } from "@/pages/DeviceApprovalPage";
import { FeatureFlagsPage } from "@/pages/FeatureFlagsPage";
import {
  PlatformSettingsPage,
  TenantIntegrationKeysPage,
} from "@/pages/PlatformSettingsPage";
import { RolesSettingsPage } from "@/pages/RolesSettingsPage";
import { SearchIndexSettingsPage } from "@/pages/SearchIndexSettingsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { SetupPluginsPage } from "@/pages/SetupPluginsPage";
import { SetupStudioPage } from "@/pages/SetupStudioPage";
import { SpaceAgentDeskPage } from "@/pages/SpaceAgentDeskPage";
import { SpaceAgentHirePage } from "@/pages/SpaceAgentHirePage";
import { SpaceAgentsPage } from "@/pages/SpaceAgentsPage";
import { SpaceChatsPage } from "@/pages/SpaceChatsPage";
import { SpaceDataPage } from "@/pages/SpaceDataPage";
import { SpaceLayout } from "@/pages/SpaceLayout";
import { SpaceRoomPage } from "@/pages/SpaceRoomPage";
import { SpaceSettingsPage } from "@/pages/SpaceSettingsPage";
import { SpacesSettingsPage } from "@/pages/SpacesSettingsPage";
import { SpaceWorkHome } from "@/pages/SpaceWorkHome";
import { TenantSettingsPage } from "@/pages/TenantSettingsPage";
import { ChatLegacySessionRedirect } from "@/routes/chat-legacy-redirect.tsx";
import { DefaultPlaceRedirect } from "@/routes/DefaultPlaceRedirect";
import { LegacyModuleRedirect } from "@/routes/LegacyModuleRedirect";
import { LegacySpaceSettingsRedirect } from "@/routes/LegacySpaceSettingsRedirect";
import { PersonalSpaceRedirect } from "@/routes/PersonalSpaceRedirect";

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

function RedirectPreserveSearch({ to }: { to: string }) {
  const { hash, search } = useLocation();
  return <Navigate replace to={`${to}${search}${hash}`} />;
}

// Where a member lands when they hit an admin-only settings page. Profile is
// always present (user-management) and personal.
const MEMBER_SETTINGS_HOME = "/settings/profile";

function LegacyAdminUserRedirect() {
  const { id } = useParams<{ id: string }>();
  return (
    <Navigate replace to={id ? `/settings/users/${id}` : "/settings/users"} />
  );
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
  //
  // Copilot is space-placed for mounts, but `/mdl/engenty-copilot` is the
  // personal desk and stays canonical. It is still passed in so the set is
  // honest; the wrapper below skips it.
  const spacePlaced = useMemo(
    () =>
      spacePlacedModuleIds([
        ...contributions.adminMenuItems,
        ...contributions.copilotApps,
      ]),
    [contributions.adminMenuItems, contributions.copilotApps]
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

  return (
    <UiContributionsProvider contributions={contributions}>
      <Routes>
        <Route element={<DefaultPlaceRedirect />} path="/" />
        <Route
          element={<Navigate replace to="/mdl/dashboard" />}
          path="/dashboard"
        />
        <Route
          element={<Navigate replace to={COPILOT_CHAT_ROOT} />}
          path="/chat"
        />
        <Route
          element={<Navigate replace to={COPILOT_CHAT_NEW} />}
          path="/chat/new"
        />
        <Route element={<ChatLegacySessionRedirect />} path="/chat/:threadId" />
        <Route element={<DeviceApprovalPage />} path="/auth/device" />
        <Route element={<NotificationsPage />} path="/notifications" />
        <Route
          element={
            isAdmin ? (
              <NotificationStreamsSettingsPage />
            ) : (
              <Navigate replace to={MEMBER_SETTINGS_HOME} />
            )
          }
          path="/settings/notifications"
        />
        <Route
          element={isAdmin ? <SetupPage /> : <DefaultPlaceRedirect />}
          path="/setup"
        />
        <Route
          element={
            isSuperAdmin ? <SetupPluginsPage /> : <DefaultPlaceRedirect />
          }
          path="/setup/plugins"
        />
        <Route
          element={<Navigate replace to="/setup/plugins" />}
          path="/admin/plugins"
        />
        <Route
          element={<Navigate replace to="/setup/audit-logs" />}
          path="/admin/audit-logs"
        />
        <Route
          element={<Navigate replace to="/settings/users" />}
          path="/admin/users"
        />
        <Route element={<LegacyAdminUserRedirect />} path="/admin/users/:id" />
        <Route
          element={
            isAdmin ? (
              <SettingsPage />
            ) : (
              // Members can't open the tenant-admin General page — land them on
              // their personal Profile.
              <Navigate replace to={MEMBER_SETTINGS_HOME} />
            )
          }
          path="/settings"
        />
        <Route
          element={
            isAdmin ? (
              <AiGeneralSettingsPage />
            ) : (
              <Navigate replace to={MEMBER_SETTINGS_HOME} />
            )
          }
          path="/setup/ai"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/ai" />}
          path="/settings/ai"
        />
        <Route
          element={<Navigate replace to={AGENTS_WORKSPACE_ROOT_PATH} />}
          path="/settings/ai-instructions"
        />
        <Route
          element={<Navigate replace to={AGENTS_WORKSPACE_ROOT_PATH} />}
          path="/settings/agents"
        />
        <Route
          element={
            isAdmin ? (
              // Tenant-wide branding (colors/fonts/sidebar) — admins only.
              // Members change their own theme/language via the user menu.
              <AppearanceSettingsPage />
            ) : (
              <Navigate replace to={MEMBER_SETTINGS_HOME} />
            )
          }
          path="/settings/appearance"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/ai?tab=usage" />}
          path="/settings/ai-usage"
        />
        <Route
          element={
            isSuperAdmin ? <RolesSettingsPage /> : <DefaultPlaceRedirect />
          }
          path="/setup/roles"
        />
        <Route
          element={<Navigate replace to="/setup/roles" />}
          path="/settings/roles"
        />
        <Route
          // Members may see the list (they work in these spaces); the page hides
          // its write affordances for them, and the API refuses them anyway.
          element={<SpacesSettingsPage />}
          path="/settings/spaces"
        />
        <Route
          element={
            isSuperAdmin ? (
              <TenantSettingsPage />
            ) : (
              <Navigate
                replace
                to={isAdmin ? "/settings" : MEMBER_SETTINGS_HOME}
              />
            )
          }
          path="/settings/tenant"
        />
        {/* The uuid form is a legacy deep link now — space settings live at
            `/s/<key>/settings` with the rest of the space. */}
        <Route
          element={<LegacySpaceSettingsRedirect />}
          path="/settings/spaces/:spaceId"
        />
        <Route
          element={
            isSuperAdmin ? <PlatformSettingsPage /> : <DefaultPlaceRedirect />
          }
          path="/setup/platform"
        />
        <Route
          element={
            isSuperAdmin || isTenantAdmin ? (
              <TenantIntegrationKeysPage />
            ) : (
              <Navigate replace to={MEMBER_SETTINGS_HOME} />
            )
          }
          path="/setup/integration-keys"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/integration-keys" />}
          path="/settings/integration-keys"
        />
        <Route
          element={
            developerModeEnabled ? (
              <DevelopmentSettingsPage />
            ) : (
              <Navigate replace to="/setup" />
            )
          }
          path="/setup/development"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/development" />}
          path="/settings/development"
        />
        <Route
          element={
            developerModeEnabled ? (
              <SetupStudioPage />
            ) : (
              <Navigate replace to="/setup" />
            )
          }
          path="/setup/studio"
        />
        <Route
          element={
            developerModeEnabled && isSuperAdmin ? (
              <FeatureFlagsPage />
            ) : (
              <DefaultPlaceRedirect />
            )
          }
          path="/setup/features"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/features" />}
          path="/settings/features"
        />
        <Route
          element={
            developerModeEnabled && isSuperAdmin ? (
              <SearchIndexSettingsPage />
            ) : (
              <DefaultPlaceRedirect />
            )
          }
          path="/setup/search-index"
        />
        <Route
          element={<RedirectPreserveSearch to="/setup/search-index" />}
          path="/settings/search-index"
        />
        <Route element={<DefaultPlaceRedirect />} path="/initial_setup" />
        <Route element={<DefaultPlaceRedirect />} path="/auth/login" />
        <Route element={<DefaultPlaceRedirect />} path="/auth/callback" />
        {contributions.routes.map((pluginRoute) => {
          const PluginPage = pluginRoute.component;
          // Admin surfaces: any /admin/* console (agents workspace, users,
          // files, context graph) plus tenant-config /settings/* pages
          // outside the personal allowlist. Audit logs live under Setup.
          // A contribution can override the default either way via `requiresAdmin`.
          const isPersonalSettings = PERSONAL_SETTINGS_PREFIXES.some((prefix) =>
            pluginRoute.path.startsWith(prefix)
          );
          // Setup is the install-owner surface. Most /setup/* paths are
          // superadmin-only; tenant-admin config (AI models, integration keys)
          // and the personal connections page are the exceptions.
          const isSetupPath =
            pluginRoute.path === "/setup" ||
            pluginRoute.path.startsWith("/setup/");
          const defaultAdminOnly =
            pluginRoute.path.startsWith("/admin/") ||
            isSetupPath ||
            (pluginRoute.path.startsWith("/settings/") && !isPersonalSettings);
          const adminOnly = pluginRoute.requiresAdmin ?? defaultAdminOnly;
          const blocked = isSetupPath
            ? isBlockedSetupPath(pluginRoute.path, { isAdmin, isSuperAdmin })
            : adminOnly && !isAdmin;
          const element = blocked ? <DefaultPlaceRedirect /> : <PluginPage />;
          // A space-placed module's legacy path redirects into its space; a
          // global one keeps `/mdl/` as canonical. Copilot is space-placed
          // for mounts but its `/mdl/` path is the personal desk — do not
          // bounce it into a space. Blocked routes never redirect.
          const redirects =
            !blocked &&
            pluginRoute.pluginId !== COPILOT_MODULE_ID &&
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
        })}
        {/* Everything inside a space. The Work/Data/Plan tabs live in the shell's
            secondary column (App.tsx `secondaryNavLeadingSlot`), so a module
            opened here keeps them and contributes its own nav directly below —
            one column, never two. Module components are the SAME ones registered
            at `/mdl/…`; they are mounted a second time and read the space from
            WorkspaceContext.currentSpace, which follows the URL. */}
        {/* Before the `:spaceKey` route, or `me` would be read as a key and 404
            against a space nobody has. */}
        <Route element={<PersonalSpaceRedirect />} path="/s/me/*" />
        <Route element={<PersonalSpaceRedirect />} path="/s/me" />
        <Route element={<SpaceLayout />} path="/s/:spaceKey">
          {/* The space root IS Work — the list of mounted modules, which lives in
              the sidebar. Nothing is selected yet, so the content area says so
              rather than redirecting into an arbitrary module. */}
          <Route element={<SpaceWorkHome />} index />
          {/* Declared before the mirrors for readability only — React Router
              ranks by specificity, and `settings` is a static segment that no
              module id can collide with (settings is a PLACEMENT, not a
              module). */}
          <Route element={<SpaceSettingsPage />} path="settings" />
          {/* The space's inbox. Reserved like `settings`: not a module, and
              the full-screen page keeps the Work sidebar with Dashboard
              selected. The dashboard bell opens the same list in a popover. */}
          <Route element={<NotificationsPage />} path="notifications" />
          {/* Static `agents` and `agents/new` before `:agentId`, or those
              segments are captured as an id. */}
          <Route element={<SpaceAgentsPage />} path="agents" />
          <Route element={<SpaceAgentHirePage />} path="agents/new" />
          <Route
            element={<SpaceAgentDeskPage canManageAgents={isAdmin} />}
            path="agents/:agentId"
          />
          {/* A room by its thread id — its own page, not a desk's engagement.
              `rooms` is a reserved segment for the same reason `chats` is. */}
          <Route
            element={<SpaceRoomPage canManageAgents={isAdmin} />}
            path="rooms/:threadId"
          />
          {/* The space's Data tree — its own page, not a module's. `data` is a
              RESERVED segment (space-module-url.ts) for the same reason
              `settings` is: without that, every reader of the URL infers a
              module called "data" and the shell hides the space's sidebar to
              show its (non-existent) nav. */}
          <Route element={<SpaceDataPage />} path="data" />
          {/* Every conversation in the space, across its agents. Reserved for
              the same reason `data` is — it is the SPACE's view over what
              several modules produced, and a module called "chats" would take
              the space's own sidebar away to show its nav. */}
          <Route element={<SpaceChatsPage />} path="chats" />
          {spaceMirroredRoutes(contributions.routes)
            // An explicitly admin-only module route keeps that gate inside a
            // space; dropping the mirror is better than mounting an unguarded
            // second copy of it.
            .filter(({ route }) => !(route.requiresAdmin && !isAdmin))
            .flatMap(({ legacyPath, path, route }) => {
              const PluginPage = route.component;
              // Mirrored for every module, reachable only while mounted: the
              // gate reads the space's surface, so a module the space never
              // added shows "not in this space" instead of its pages.
              const element = (
                <SpaceModuleGate key={route.id} moduleId={route.pluginId}>
                  <PluginPage />
                </SpaceModuleGate>
              );
              return [
                <Route element={element} key={route.id} path={path} />,
                // The pre-alias URL, still mounted so in-flight deep links open
                // the page instead of falling through to the catch-all.
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
            })}
        </Route>
        <Route element={<DefaultPlaceRedirect />} path="*" />
      </Routes>
    </UiContributionsProvider>
  );
}
