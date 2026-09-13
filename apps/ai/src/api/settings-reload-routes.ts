// POST /ai/internal/settings/reload — re-read the platform-scoped settings
// this process serves from `process.env`.
//
// Core calls it after every platform-setting write, with a service token it
// signed itself (platform-settings-reload.ts). Without this edge a key saved in
// the browser sat in the database until the next restart while the wizard
// said "connected".

import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

export interface SettingsReloadDeps {
  bootOnlyKeys: () => readonly string[];
  reload: () => Promise<{ cleared: string[]; hydrated: string[] }>;
  scopeResolver: AiScopeResolver;
}

export function registerSettingsReloadRoutes(
  app: Hono<any>,
  deps: SettingsReloadDeps
): void {
  app.post(`${AI_BASE_PATH}/internal/settings/reload`, async (c) => {
    const resolved = await resolveScope(c, deps.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const scope = resolved.scope;
    // Core's own service principal, or the platform operator from the
    // settings page. A tenant admin holds `*` too, so a capability check
    // could not tell them apart — the superadmin boolean is the gate.
    if (!(scope.credential?.kind === "service" || scope.isSuperAdmin)) {
      return c.json({ error: "settings.reloadForbidden" }, 403);
    }
    const result = await deps.reload();
    return c.json({
      bootOnly: deps.bootOnlyKeys(),
      cleared: result.cleared,
      hydrated: result.hydrated,
    });
  });
}
