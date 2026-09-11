import type { Mastra } from "@mastra/core/mastra";
import type { Hono } from "hono";
import type { AiRegistry } from "../ai/registry/types.js";
import {
  type ActivateStudioTenantInput,
  activateStudioTenant,
  getStudioTenantStatus,
} from "../ai/studio-tenant-agents.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { isMastraStudioApiEnabled } from "../config/mastra-studio-api.js";
import { readStudioTenantIdFromEnv } from "../config/mastra-studio-tenant.js";
import type { ThreadStore } from "../dal/threads/index.js";
import type { AiScopeResolver } from "./http.js";
import { resolveScope } from "./http.js";

export interface RegisterStudioTenantRoutesOptions {
  assembleAgent?: ActivateStudioTenantInput["assembleAgent"];
  createRegistry: (tenantId: string) => AiRegistry;
  mastra: Mastra;
  scopeResolver: AiScopeResolver;
  threadStore?: ThreadStore | null;
}

export function registerStudioTenantRoutes(
  app: Hono<any>,
  options: RegisterStudioTenantRoutesOptions
): void {
  app.get(`${AI_BASE_PATH}/studio/status`, async (c) => {
    if (!isMastraStudioApiEnabled()) {
      return c.json({ error: "studio.disabled" }, 404);
    }
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    return c.json(getStudioTenantStatus());
  });

  app.post(`${AI_BASE_PATH}/studio/activate`, async (c) => {
    if (!isMastraStudioApiEnabled()) {
      return c.json({ error: "studio.disabled" }, 404);
    }
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const envPin = readStudioTenantIdFromEnv();
    if (envPin && envPin !== resolved.scope.tenantId) {
      return c.json(
        {
          error: "studio.tenantEnvMismatch",
          envTenantId: envPin,
        },
        409
      );
    }
    const status = await activateStudioTenant({
      assembleAgent: options.assembleAgent,
      createRegistry: options.createRegistry,
      mastra: options.mastra,
      tenantId: resolved.scope.tenantId,
      threadStore: options.threadStore,
    });
    return c.json(status);
  });
}
