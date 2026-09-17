import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { AgentLoginPage } from "./routes/agent-login-page";
import { CallbackPage } from "./routes/callback-page";
import { DevLoginPage } from "./routes/dev-login-page";
import { InitialSetupPage } from "./routes/initial-setup-page";
import { LoginPage } from "./routes/login-page";
import { OAuthConsentPage } from "./routes/oauth-consent-page";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "auth-ui",
    namespace: "auth",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "auth_dev_login",
    path: "/auth/dev-login",
    component: DevLoginPage,
    order: 9,
    scope: "public",
  });

  engenty.UI.registerRoute({
    id: "auth_agent_login",
    path: "/auth/agent-login",
    component: AgentLoginPage,
    order: 9,
    scope: "public",
  });

  engenty.UI.registerRoute({
    id: "auth_initial_setup",
    path: "/initial_setup",
    component: InitialSetupPage,
    order: 9,
  });

  engenty.UI.registerRoute({
    id: "auth_login",
    path: "/auth/login",
    component: LoginPage,
    order: 10,
  });

  engenty.UI.registerRoute({
    id: "auth_callback",
    path: "/auth/callback",
    component: CallbackPage,
    order: 11,
  });

  engenty.UI.registerRoute({
    id: "auth_oauth_consent",
    path: "/oauth/consent",
    component: OAuthConsentPage,
    order: 8,
    scope: "public",
  });
}
