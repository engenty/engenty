// Memory entries over HTTP — what a person sees and edits of `ai.memory_entries`.
//
//   GET    /ai/v1/memory/entries?scope=…[&agent_id][&space_id]
//   POST   /ai/v1/memory/entries?…          { body }
//   PATCH  /ai/v1/memory/entries/:id?…      { body }
//   DELETE /ai/v1/memory/entries/:id?…
//   PATCH  /ai/v1/memory/working?…          { fields: { key: value | null } }
//
// GET also returns the key's working memory (`ai.working_memory`), which a
// person edits field by field; the company's only with
// `core.company_memory.manage`.
//
// The query names the key (memory-entry-access.ts); a row is only ever
// touched through it. Company entries are written by core alone: add and
// remove are forwarded there with the person's token, and core checks
// `core.company_memory.manage`. They have no edit — remove and add again.
import {
  type AiRegistry,
  COMPANY_MEMORY_ADD_OPERATION_ID,
  COMPANY_MEMORY_REMOVE_OPERATION_ID,
  MEMORY_BODY_MAX_CHARS,
  MEMORY_SECTION_MAX_CHARS,
  memorySectionFits,
  memorySectionLength,
  normalizeMemoryBody,
  normalizeWorkingMemoryPatch,
  shortMemoryId,
  WORKING_MEMORY_VALUE_MAX_CHARS,
} from "@engenty/ai-core";
import type { Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { type AiSessionScope, scopeAccessToken } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type {
  MemoryEntryRow,
  MemoryEntryStore,
  WorkingMemoryStore,
} from "../dal/memory/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";
import {
  memoryEntryQuerySchema,
  resolveMemoryAccess,
} from "./memory-entry-access.js";

const bodySchema = z.object({
  body: z.string().min(1).max(MEMORY_BODY_MAX_CHARS),
});

const workingBodySchema = z.object({
  fields: z.record(
    z.string(),
    z.string().max(WORKING_MEMORY_VALUE_MAX_CHARS).nullable()
  ),
});

function entryDto(row: MemoryEntryRow) {
  return {
    body: row.body,
    created_at: row.created_at,
    created_by_user_id: row.created_by_user_id,
    id: row.id,
    short_id: shortMemoryId(row.id),
    updated_at: row.updated_at,
  };
}

function coreClientFor(scope: AiSessionScope): EngentyCoreClient | null {
  const accessToken = scopeAccessToken(scope);
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  return accessToken && coreBaseUrl
    ? new EngentyCoreClient({ accessToken, coreBaseUrl })
    : null;
}

export function registerMemoryEntryRoutes(
  app: Hono<any>,
  options: {
    getRegistry: (tenantId: string) => AiRegistry;
    scopeResolver: AiScopeResolver;
    store: MemoryEntryStore;
    workingStore: WorkingMemoryStore;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/memory/entries`;

  /** Scope, key and edit right for this request, or the response that refuses it. */
  const access = async (c: any) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return { ok: false as const, response: resolved.response };
    }
    const query = memoryEntryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return {
        ok: false as const,
        response: c.json(
          { details: query.error.issues, error: "memory.invalidQuery" },
          400
        ),
      };
    }
    const result = await resolveMemoryAccess({
      query: query.data,
      registry: options.getRegistry(resolved.scope.tenantId),
      scope: resolved.scope,
    });
    if (!result.ok) {
      return {
        ok: false as const,
        response: c.json({ error: result.error }, result.status),
      };
    }
    return { ...result, scope: resolved.scope };
  };

  const list = (
    tenantId: string,
    key: Parameters<MemoryEntryStore["list"]>[0]["key"]
  ) => options.store.list({ key, tenantId });

  app.get(base, async (c) => {
    const granted = await access(c);
    if (!granted.ok) {
      return granted.response;
    }
    try {
      const [rows, working] = await Promise.all([
        list(granted.scope.tenantId, granted.key),
        options.workingStore.get({
          key: granted.key,
          tenantId: granted.scope.tenantId,
        }),
      ]);
      return c.json({
        can_edit: granted.canEdit,
        characters: memorySectionLength(rows),
        entries: rows.map(entryDto),
        max_chars: MEMORY_SECTION_MAX_CHARS[granted.key.scope],
        working: {
          state: working?.state ?? {},
          updated_at: working?.updated_at ?? null,
        },
      });
    } catch (error) {
      return handleRouteError(
        c,
        "memory list failed",
        "memory.internalError",
        error
      );
    }
  });

  app.post(base, async (c) => {
    const granted = await access(c);
    if (!granted.ok) {
      return granted.response;
    }
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "memory.invalidBody" },
        400
      );
    }
    if (!granted.canEdit) {
      return c.json({ error: "memory.forbidden" }, 403);
    }
    const body = normalizeMemoryBody(parsed.data.body);
    try {
      if (granted.key.scope === "company") {
        const core = coreClientFor(granted.scope);
        if (!core) {
          return c.json({ error: "memory.unconfiguredCore" }, 503);
        }
        await core.invokeTool(COMPANY_MEMORY_ADD_OPERATION_ID, { body });
      } else {
        const rows = await list(granted.scope.tenantId, granted.key);
        const room = memorySectionFits({
          body,
          rows,
          scope: granted.key.scope,
        });
        if (!room.fits) {
          return c.json({ error: "memory.sectionFull", ...room }, 413);
        }
        await options.store.insert({
          body,
          createdByUserId: granted.scope.userId,
          key: granted.key,
          tenantId: granted.scope.tenantId,
        });
      }
      return c.json({ ok: true }, 201);
    } catch (error) {
      if (error instanceof EngentyCoreHttpError) {
        return c.json({ error: error.code }, error.status === 413 ? 413 : 403);
      }
      return handleRouteError(
        c,
        "memory add failed",
        "memory.internalError",
        error
      );
    }
  });

  app.patch(`${base}/:id`, async (c) => {
    const granted = await access(c);
    if (!granted.ok) {
      return granted.response;
    }
    const id = c.req.param("id");
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!(uuidString.safeParse(id).success && parsed.success)) {
      return c.json({ error: "memory.invalidBody" }, 400);
    }
    if (!granted.canEdit || granted.key.scope === "company") {
      return c.json({ error: "memory.forbidden" }, 403);
    }
    try {
      const row = await options.store.update({
        body: normalizeMemoryBody(parsed.data.body),
        id,
        key: granted.key,
        tenantId: granted.scope.tenantId,
      });
      return row
        ? c.json({ entry: entryDto(row) })
        : c.json({ error: "memory.notFound" }, 404);
    } catch (error) {
      return handleRouteError(
        c,
        "memory edit failed",
        "memory.internalError",
        error
      );
    }
  });

  app.delete(`${base}/:id`, async (c) => {
    const granted = await access(c);
    if (!granted.ok) {
      return granted.response;
    }
    const id = c.req.param("id");
    if (!uuidString.safeParse(id).success) {
      return c.json({ error: "memory.invalidBody" }, 400);
    }
    if (!granted.canEdit) {
      return c.json({ error: "memory.forbidden" }, 403);
    }
    try {
      if (granted.key.scope === "company") {
        const core = coreClientFor(granted.scope);
        if (!core) {
          return c.json({ error: "memory.unconfiguredCore" }, 503);
        }
        await core.invokeTool(COMPANY_MEMORY_REMOVE_OPERATION_ID, { id });
        return c.json({ ok: true });
      }
      const removed = await options.store.delete({
        id,
        key: granted.key,
        tenantId: granted.scope.tenantId,
      });
      return removed
        ? c.json({ ok: true })
        : c.json({ error: "memory.notFound" }, 404);
    } catch (error) {
      if (error instanceof EngentyCoreHttpError) {
        return c.json({ error: error.code }, error.status === 404 ? 404 : 403);
      }
      return handleRouteError(
        c,
        "memory remove failed",
        "memory.internalError",
        error
      );
    }
  });

  app.patch(`${AI_BASE_PATH}/v1/memory/working`, async (c) => {
    const granted = await access(c);
    if (!granted.ok) {
      return granted.response;
    }
    const parsed = workingBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        { details: parsed.error.issues, error: "memory.invalidBody" },
        400
      );
    }
    if (!granted.canEdit) {
      return c.json({ error: "memory.forbidden" }, 403);
    }
    const patch = normalizeWorkingMemoryPatch(
      granted.key.scope,
      parsed.data.fields
    );
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "memory.unknownField" }, 400);
    }
    try {
      const state = await options.workingStore.patch({
        key: granted.key,
        patch,
        tenantId: granted.scope.tenantId,
        updatedByUserId: granted.scope.userId,
      });
      return c.json({ working: { state } });
    } catch (error) {
      return handleRouteError(
        c,
        "working memory update failed",
        "memory.internalError",
        error
      );
    }
  });
}
