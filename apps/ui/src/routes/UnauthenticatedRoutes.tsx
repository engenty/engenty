import {
  AgentLoginPage,
  AuthRedirect,
  CallbackPage,
  DevLoginPage,
  InitialSetupPage,
  InitialSetupPreviewPage,
  LoginPage,
  OAuthConsentPage,
  ServiceUnavailablePage,
  TENANT_SETUP_PATH,
  TenantSetupPage,
} from "@engenty/auth-ui";
import type { UiContributions } from "@engenty/ui-plugin-sdk";
import { Route, Routes } from "react-router-dom";

interface UnauthenticatedRoutesProps {
  contributions: UiContributions;
}

export function UnauthenticatedRoutes({
  contributions,
}: UnauthenticatedRoutesProps) {
  return (
    <Routes>
      {contributions.routes
        .filter((pluginRoute) => pluginRoute.scope === "public")
        .map((pluginRoute) => {
          const PluginPage = pluginRoute.component;
          return (
            <Route
              element={<PluginPage />}
              key={pluginRoute.id}
              path={pluginRoute.path}
            />
          );
        })}
      <Route element={<InitialSetupPage />} path="/initial_setup" />
      <Route element={<InitialSetupPreviewPage />} path="/auth/setup-preview" />
      <Route element={<TenantSetupPage />} path={TENANT_SETUP_PATH} />
      <Route element={<DevLoginPage />} path="/auth/dev-login" />
      <Route element={<AgentLoginPage />} path="/auth/agent-login" />
      <Route element={<LoginPage />} path="/auth/login" />
      <Route element={<CallbackPage />} path="/auth/callback" />
      {/* Hardcoded: MCP OAuth must not depend on public plugin bootstrap. */}
      <Route element={<OAuthConsentPage />} path="/oauth/consent" />
      <Route element={<ServiceUnavailablePage />} path="/service_unavailable" />
      <Route element={<AuthRedirect />} path="*" />
    </Routes>
  );
}
