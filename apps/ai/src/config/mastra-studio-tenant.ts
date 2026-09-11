import { isMastraStudioApiEnabled } from "./mastra-studio-api.js";

/** Optional boot pin for Mastra Studio (local / single-tenant). */
export const MASTRA_STUDIO_TENANT_ENV = "ENGENTY_STUDIO_TENANT_ID";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tenant UUID to register on the process-wide Mastra instance for Studio.
 *
 * Unset, invalid, production, or Studio-off → `undefined`. Same production
 * hard-off as {@link isMastraStudioApiEnabled}: the variable is ignored rather
 * than trusted.
 */
export function readStudioTenantIdFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!isMastraStudioApiEnabled(env)) {
    return;
  }
  const raw = env[MASTRA_STUDIO_TENANT_ENV]?.trim();
  if (!(raw && UUID_RE.test(raw))) {
    return;
  }
  return raw.toLowerCase();
}
