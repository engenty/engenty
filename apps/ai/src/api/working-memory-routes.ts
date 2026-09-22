// Working-memory profile API — the read-only "what the copilot knows about
// you" settings view + reset. The profile is resource-scoped working memory
// maintained by the agent (see concrete-memory.ts); rows live in
// ai.mastra_resources keyed `${tenantId}:${userId}`. The copilot's pads
// (MEMORY.md, TASKS.md) are the desk's, like every agent's
// (agent-desk/routes.ts) — this file is the working memory alone.
import type { AiRegistry } from "@engenty/ai-core";
import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";
import { getMemoryResourceStore as getResourceStore } from "./memory-resource-store.js";

export function registerWorkingMemoryRoutes(
  app: Hono<any>,
  options: {
    getRegistry: (tenantId: string) => AiRegistry;
    scopeResolver: AiScopeResolver;
  }
) {
  const base = `${AI_BASE_PATH}/v1/memory/working`;

  app.get(base, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const store = await getResourceStore();
      const record = store
        ? await store.getResourceById({
            resourceId: `${resolved.scope.tenantId}:${resolved.scope.userId}`,
          })
        : null;
      return c.json({
        updated_at:
          record?.updatedAt instanceof Date
            ? record.updatedAt.toISOString()
            : ((record?.updatedAt as string | undefined) ?? null),
        working_memory: record?.workingMemory ?? null,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read working memory",
        "memory.internalError",
        err
      );
    }
  });

  app.delete(base, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const store = await getResourceStore();
      if (store) {
        await store.updateResource({
          resourceId: `${resolved.scope.tenantId}:${resolved.scope.userId}`,
          workingMemory: "",
        });
      }
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reset working memory",
        "memory.internalError",
        err
      );
    }
  });
}
