// Whose browser a run may drive, and with which standing consents
// (PLAN-user-browser.md §2.2, D3). The browser is the person's — one per
// user in the tenant, not per space — so the answer is the same wherever
// the run stands; only where the answer is READ differs. In a space the
// grant rides the surface the run already fetched (core names the acting
// person there, a routine's author included). Outside any space — the
// copilot's river — there is no surface, so the run asks core for the
// caller's own grant.

import { createLogger } from "@engenty/telemetry";

import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import type { AiSessionScope } from "../sessions/types.js";
import { scopeAccessToken, scopeAttributionUserId } from "../sessions/types.js";

const logger = createLogger({ name: "apps/ai/run-browser" });

export interface RunBrowser {
  autostart: boolean;
  unattended: boolean;
  userId: string;
}

/** Where the run stands: the shape both a run-space resolution and a gate context reduce to. */
export type RunBrowserSource =
  | { kind: "global" }
  | {
      kind: "resolved";
      space: {
        browser?: {
          autostart?: boolean;
          unattended: boolean;
          userId: string;
        } | null;
      };
    }
  | { kind: "unresolved" };

const GRANT_CACHE_TTL_MS = 30_000;
const grantCache = new Map<
  string,
  { expiresAt: number; grant: { autostart: boolean; unattended: boolean } }
>();

async function readOwnGrant(
  scope: AiSessionScope
): Promise<{ autostart: boolean; unattended: boolean }> {
  const none = { autostart: false, unattended: false };
  const accessToken = scopeAccessToken(scope)?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    return none;
  }
  const key = `${scope.tenantId}:${scope.userId}`;
  const cached = grantCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.grant;
  }
  try {
    const grant = await new EngentyCoreClient({
      accessToken,
      coreBaseUrl,
    }).getMyBrowserGrant();
    const resolved = {
      autostart: grant.autostart === true,
      unattended: grant.unattended === true,
    };
    grantCache.set(key, {
      expiresAt: now + GRANT_CACHE_TTL_MS,
      grant: resolved,
    });
    return resolved;
  } catch (err) {
    // No grant is the narrow answer: the tools still attach when a browser
    // exists, but a headless run stops with `needs_user`.
    logger.warn("own browser grant unavailable; treating as not granted", {
      message: err instanceof Error ? err.message : String(err),
      tenant_id: scope.tenantId,
    });
    return none;
  }
}

/**
 * The person whose browser this run may drive, or null when there is nobody
 * (a service principal acting for no one) or the run's space claim did not
 * resolve (nothing is widened for a run that has no surface).
 */
export async function resolveRunBrowser(input: {
  scope: AiSessionScope;
  source: RunBrowserSource;
}): Promise<RunBrowser | null> {
  if (input.source.kind === "unresolved") {
    return null;
  }
  if (input.source.kind === "resolved") {
    const browser = input.source.space.browser;
    return browser
      ? {
          autostart: browser.autostart === true,
          unattended: browser.unattended,
          userId: browser.userId,
        }
      : null;
  }
  const userId = scopeAttributionUserId(input.scope);
  if (!userId) {
    return null;
  }
  const grant = await readOwnGrant(input.scope);
  return { ...grant, userId };
}

/** Tests only — the grant cache is process-global. */
export function resetRunBrowserCacheForTests(): void {
  grantCache.clear();
}
