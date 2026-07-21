import {
  AGENTS_WORKSPACE_ROOT_PATH,
  AiGeneralSettingsPage,
} from "@engenty/ai-ui";
import {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
} from "@engenty/engenty-copilot/paths";
import {
  type UiContributions,
  UiContributionsProvider,
} from "@engenty/ui-plugin-sdk";
import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";
import { AiUsagePage } from "@/pages/AiUsagePage";
import { AppearanceSettingsPage } from "@/pages/AppearanceSettingsPage";
import { DevelopmentSettingsPage } from "@/pages/DevelopmentSettingsPage";
import { DeviceApprovalPage } from "@/pages/DeviceApprovalPage";
import { FeatureFlagsPage } from "@/pages/FeatureFlagsPage";
import { RolesSettingsPage } from "@/pages/RolesSettingsPage";
import { SearchIndexSettingsPage } from "@/pages/SearchIndexSettingsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPluginsPage } from "@/pages/SetupPluginsPage";
import { ChatLegacySessionRedirect } from "@/routes/chat-legacy-redirect.tsx";

interface AuthenticatedRoutesProps {
  contributions: UiContributions;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

// Settings pages that are genuinely per-user (not tenant config) and so stay
// reachable by members even though they live under /settings/*. Appearance is
// NOT here — it is the tenant-wide branding editor (writes tenant settings);
// members change only their own theme/language via the user menu.
const PERSONAL_SETTINGS_PREFIXES = [
  "/settings/profile",
  "/settings/connections",
];

// Where a member lands when they hit an admin-only settings page. Profile is
// always present (user-management) and personal.
const MEMBER_SETTINGS_HOME = "/settings/profile";

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
        <Route element={<Navigate replace to={COPILOT_CHAT_ROOT} />} path="/" />
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
        <Route
          element={
            isAdmin ? (
              <SetupPluginsPage isSuperAdmin={isSuperAdmin} />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/setup/plugins"
        />
        <Route
          element={<Navigate replace to="/setup/plugins" />}
          path="/admin/plugins"
        />
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
          element={
            isSuperAdmin || isTenantAdmin ? (
              <AiUsagePage />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/settings/ai-usage"
        />
        <Route
          element={
            isSuperAdmin || isTenantAdmin ? (
              <RolesSettingsPage />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/settings/roles"
        />
        <Route
          element={
            developerModeEnabled ? (
              <DevelopmentSettingsPage />
            ) : (
              <Navigate replace to="/settings" />
            )
          }
          path="/settings/development"
        />
        <Route
          element={
            developerModeEnabled && isSuperAdmin ? (
              <FeatureFlagsPage />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/settings/features"
        />
        <Route
          element={
            developerModeEnabled && isSuperAdmin ? (
              <SearchIndexSettingsPage />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/settings/search-index"
        />
        <Route
          element={<Navigate replace to={COPILOT_CHAT_ROOT} />}
          path="/initial_setup"
        />
        <Route
          element={<Navigate replace to={COPILOT_CHAT_ROOT} />}
          path="/auth/login"
        />
        <Route
          element={<Navigate replace to={COPILOT_CHAT_ROOT} />}
          path="/auth/callback"
        />
        {contributions.routes.map((pluginRoute) => {
          const PluginPage = pluginRoute.component;
          // Admin surfaces: any /admin/* console (agents workspace, users, audit
          // logs, files, context graph) plus tenant-config /settings/* pages
          // outside the personal allowlist. A contribution can override the
          // default either way via `requiresAdmin`.
          const isPersonalSettings = PERSONAL_SETTINGS_PREFIXES.some((prefix) =>
            pluginRoute.path.startsWith(prefix)
          );
          const defaultAdminOnly =
            pluginRoute.path.startsWith("/admin/") ||
            pluginRoute.path === "/setup" ||
            pluginRoute.path.startsWith("/setup/") ||
            (pluginRoute.path.startsWith("/settings/") && !isPersonalSettings);
          const adminOnly = pluginRoute.requiresAdmin ?? defaultAdminOnly;
          return (
            <Route
              element={
                adminOnly && !isAdmin ? (
                  <Navigate replace to={COPILOT_CHAT_ROOT} />
                ) : (
                  <PluginPage />
                )
              }
              key={pluginRoute.id}
              path={pluginRoute.path}
            />
          );
        })}
        <Route element={<Navigate replace to={COPILOT_CHAT_ROOT} />} path="*" />
      </Routes>
    </UiContributionsProvider>
  );
}
