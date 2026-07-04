// Working-memory profile API — the read-only "what the assistant knows about
// you" settings view + reset. The profile is resource-scoped working memory
// maintained by the agent (see concrete-memory.ts); rows live in
// ai.mastra_resources keyed `${tenantId}:${userId}`.
import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

interface ResourceStoreLike {
  getResourceById(input: {
    resourceId: string;
  }): Promise<{ updatedAt?: unknown; workingMemory?: string | null } | null>;
  updateResource(input: {
    resourceId: string;
    workingMemory?: string;
  }): Promise<unknown>;
}

async function getResourceStore(): Promise<ResourceStoreLike | null> {
  const { mastra } = await import("../../ai/index.js");
  const storage = mastra.getStorage();
  if (!storage) {
    return null;
  }
  const store = (await Promise.resolve(
    (storage as unknown as { getStore: (domain: string) => unknown }).getStore(
      "memory"
    )
  )) as ResourceStoreLike | undefined;
  return store ?? null;
}

export function registerWorkingMemoryRoutes(
  app: Hono<any>,
  options: { scopeResolver: AiScopeResolver }
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
