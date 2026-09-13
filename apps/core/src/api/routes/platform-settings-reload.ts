import { uuidv7 } from "uuidv7";
import { signPrincipalToken } from "./auth/auth-routes.js";

/**
 * A platform setting written through the API has to be live in BOTH
 * processes that read it from `process.env`: core applies it in place
 * (`applyPlatformSettingToEnv`) and asks apps/ai to re-hydrate here.
 *
 * Core is the issuer of the tokens apps/ai verifies, so it signs a short
 * service token itself, the way the routine event bridge does. The tenant on
 * it is the writing admin's: platform settings have no tenant dimension, but
 * apps/ai's scope resolver answers only for a principal that has one.
 */
export type AiSettingsReloadOutcome =
  | { hydrated: string[]; status: "reloaded" }
  | { detail: string; status: "unreachable" }
  | { status: "skipped" };

const RELOAD_TIMEOUT_MS = 5000;

export function aiBaseUrlFromEnv(): string | null {
  const raw =
    process.env.ENGENTY_AI_BASE_URL?.trim() ||
    process.env.VITE_ENGENTY_AI_BASE_URL?.trim() ||
    "";
  return raw ? raw.replace(/\/+$/, "") : null;
}

export async function notifyAiSettingsReload(params: {
  aiBaseUrl: string | null;
  fetchImpl?: typeof fetch;
  secret: string;
  tenantId: string;
}): Promise<AiSettingsReloadOutcome> {
  if (!(params.aiBaseUrl && params.secret)) {
    return { status: "skipped" };
  }
  const token = await signPrincipalToken({
    expiresInSeconds: 60,
    principal: {
      audience: ["engenty"],
      authMethod: "service_credential",
      capabilities: ["*"],
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: "engenty.platform-settings",
      principalType: "service",
      roleProfiles: [],
      roles: [],
      scopes: [],
      tenantId: params.tenantId,
      tokenType: "access",
    },
    secret: params.secret,
    tokenId: uuidv7(),
    tokenType: "access",
  });
  try {
    const response = await (params.fetchImpl ?? fetch)(
      `${params.aiBaseUrl}/ai/internal/settings/reload`,
      {
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        signal: AbortSignal.timeout(RELOAD_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      return {
        detail: `apps/ai answered HTTP ${response.status}`,
        status: "unreachable",
      };
    }
    const body = (await response.json().catch(() => ({}))) as {
      hydrated?: unknown;
    };
    return {
      hydrated: Array.isArray(body.hydrated)
        ? body.hydrated.filter((k): k is string => typeof k === "string")
        : [],
      status: "reloaded",
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      status: "unreachable",
    };
  }
}
