// Builds a tenant/platform-aware resolver for connector OAuth CLIENT credentials
// (clientIdEnv / clientSecretEnv), derived from the connector registry. Both the
// connections module (catalog `configured` flag, OAuth start/exchange) and the
// SDK runtime (token refresh) use it so a tenant can bring their own OAuth app.

import {
  createPlatformSettingsRepoSupabase,
  createSettingsResolver,
  type SettingSpec,
} from "@engenty/platform-settings";
import type { ClientEnvResolver } from "./oauth2.js";
import { listConnectorDefinitions } from "./registry.js";

function clientCredentialSpecs(): SettingSpec[] {
  const specs = new Map<string, SettingSpec>();
  for (const connector of listConnectorDefinitions()) {
    if (connector.auth.kind !== "oauth2") {
      continue;
    }
    const { clientIdEnv, clientSecretEnv } = connector.auth.oauth2;
    if (clientIdEnv) {
      specs.set(clientIdEnv, {
        key: clientIdEnv,
        configurable: "tenant",
        secret: false,
        type: "string",
      });
    }
    if (clientSecretEnv) {
      specs.set(clientSecretEnv, {
        key: clientSecretEnv,
        configurable: "tenant",
        secret: true,
        type: "secret",
      });
    }
  }
  return [...specs.values()];
}

/**
 * Returns a factory `(tenantId) => ClientEnvResolver` over the connector client
 * credentials. Resolution per key: tenant override → platform setting →
 * process.env. Never throws from the resolver itself.
 */
export function createConnectorClientEnv(
  supabase: unknown,
  options: { logger?: (message: string, error?: unknown) => void } = {}
): (tenantId: string | null) => ClientEnvResolver {
  const repo = createPlatformSettingsRepoSupabase(supabase, {
    logger: options.logger,
  });
  const resolver = createSettingsResolver({
    repo,
    specs: clientCredentialSpecs(),
  });
  return (tenantId) => (key) => resolver.resolveSetting(key, { tenantId });
}
