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
import { Navigate, Route, Routes } from "react-router-dom";
import { AiUsagePage } from "@/pages/AiUsagePage";
import { AppearanceSettingsPage } from "@/pages/AppearanceSettingsPage";
import { DevelopmentSettingsPage } from "@/pages/DevelopmentSettingsPage";
import { DeviceApprovalPage } from "@/pages/DeviceApprovalPage";
import { FeatureFlagsPage } from "@/pages/FeatureFlagsPage";
import { SearchIndexSettingsPage } from "@/pages/SearchIndexSettingsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TenantPluginsPage } from "@/pages/TenantPluginsPage";
import { ChatLegacySessionRedirect } from "@/routes/chat-legacy-redirect.tsx";

interface AuthenticatedRoutesProps {
  contributions: UiContributions;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export function AuthenticatedRoutes({
  contributions,
  isSuperAdmin,
  isTenantAdmin,
}: AuthenticatedRoutesProps) {
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
        <Route element={<TenantPluginsPage />} path="/admin/plugins" />
        <Route element={<SettingsPage />} path="/settings" />
        <Route element={<AiGeneralSettingsPage />} path="/settings/ai" />
        <Route
          element={<Navigate replace to={AGENTS_WORKSPACE_ROOT_PATH} />}
          path="/settings/ai-instructions"
        />
        <Route
          element={<Navigate replace to={AGENTS_WORKSPACE_ROOT_PATH} />}
          path="/settings/agents"
        />
        <Route
          element={<AppearanceSettingsPage />}
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
          element={<DevelopmentSettingsPage />}
          path="/settings/development"
        />
        <Route
          element={
            isSuperAdmin ? (
              <FeatureFlagsPage />
            ) : (
              <Navigate replace to={COPILOT_CHAT_ROOT} />
            )
          }
          path="/settings/features"
        />
        <Route
          element={
            isSuperAdmin ? (
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
          return (
            <Route
              element={<PluginPage />}
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
