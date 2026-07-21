// Tenant/platform-aware resolver for connector OAuth client credentials, used
// by the OAuth flow (connect + token exchange) and the catalog `configured`
// flag. Thin wrapper over the shared SDK builder so the connect path and the
// token-refresh path (connections-sdk runtime) resolve credentials identically.

import {
  type ClientEnvResolver,
  createConnectorClientEnv,
} from "@engenty/connections-sdk";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "connections-settings" });

export interface ConnectionsSettingsResolver {
  /** A per-request client-credential resolver bound to a tenant, for the OAuth SDK. */
  clientEnv(tenantId: string | null): ClientEnvResolver;
}

export function createConnectionsSettingsResolver(
  supabase: unknown
): ConnectionsSettingsResolver {
  const clientEnv = createConnectorClientEnv(supabase, {
    logger: (msg, err) => logger.warn(msg, err),
  });
  return { clientEnv };
}
