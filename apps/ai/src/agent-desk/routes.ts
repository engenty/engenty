import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { ensureHireWelcome } from "../ai/hire/hire-welcome.js";
import {
  type AiRegistry,
  type AiService,
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/index.js";
import type { AgentMemoryStore } from "../ai/memory/agent-memory.js";
import {
  AGENT_MEMORY_MAX_CHARS,
  AgentMemoryTooLargeError,
  agentMemoryResourceId,
  readAgentMemory,
  writeAgentMemory,
} from "../ai/memory/agent-memory.js";
import {
  AGENT_TASKS_MAX_CHARS,
  AgentTasksTooLargeError,
  agentTasksResourceId,
  readAgentTasks,
  writeAgentTasks,
} from "../ai/memory/agent-tasks.js";
import { resolveSharedObservationsScope } from "../ai/memory/shared-observational-memory.js";
import { scopeAccessToken } from "../ai/sessions.js";
import type { AiScopeResolver } from "../api/http.js";
import { handleRouteError, resolveScope, uuidString } from "../api/http.js";
import { getMemoryResourceStore } from "../api/memory-resource-store.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RegistryStore } from "../dal/registry/index.js";
import { getTenantDbFactoryFromEnv } from "../infra/tenant-db.js";
import {
  firstUserTextFromParts,
  generateAgentDeskStarters,
} from "./generate-starters.js";
import {
  AgentDeskNotFoundError,
  type AgentDeskTask,
  buildAgentDeskFeed,
} from "./service.js";

const querySchema = z.object({
  agent_id: z.string().trim().min(1).max(128),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  locale: z.string().trim().min(2).max(16).default("en"),
  // Absent for the copilot's desk (service.ts `buildSpacelessDeskFeed`).
  space_id: uuidString.optional(),
});

const tasksResultSchema = z.array(
  z.object({
    checkout_run_id: z.string().nullable(),
    completed_at: z.string().nullable(),
    has_open_question: z.boolean().optional(),
    id: z.string(),
    identifier: z.string(),
    pending_approval_operation_ids: z.array(z.string()).optional(),
    status: z.string(),
    title: z.string(),
    updated_at: z.string(),
  })
);

export interface RegisterAgentDeskRoutesOptions {
  aiService: AiService;
  coreBaseUrl?: string;
  coreFetch?: typeof fetch;
  /** The `ai.mastra_resources` store; defaults to the process's Mastra storage. */
  getMemoryStore?: () => Promise<AgentMemoryStore | null>;
  getRegistry: (tenantId: string) => AiRegistry;
  getStore?: () => RegistryStore | null;
  scopeResolver: AiScopeResolver;
}

export function registerAgentDeskRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  options: RegisterAgentDeskRoutesOptions
): void {
  app.get(`${AI_BASE_PATH}/v1/agent-desk/feed`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = querySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    const accessToken = scopeAccessToken(resolved.scope);
    const coreBaseUrl = options.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (!(accessToken && coreBaseUrl)) {
      return c.json({ error: "agent_desk.unconfiguredCore" }, 503);
    }
    const core = new EngentyCoreClient({
      accessToken,
      coreBaseUrl,
      fetchImpl: options.coreFetch,
    });

    try {
      const feed = await buildAgentDeskFeed({
        agentId: query.data.agent_id,
        cursor: query.data.cursor,
        dependencies: {
          getAgent: (agentId) =>
            options
              .getRegistry(resolved.scope.tenantId)
              .getAgentConfig(agentId),
          getSpaceSurface: (spaceId) => core.getSpaceSurface(spaceId),
          listSpaces: () => core.listSpaces(),
          listTasks: async ({ agentId, spaceId }) => {
            const raw = await core.invokeTool("tasks_list", {
              page: 1,
              pageSize: 50,
              include_agent_desk_state: true,
              primary_assignee_agent_type_key: agentId,
              sortBy: "updated_at",
              sortOrder: "desc",
              space_id: spaceId,
            });
            return tasksResultSchema.parse(raw) as AgentDeskTask[];
          },
          listThreads: async ({ agentId, limit, spaceId }) =>
            (
              await options.aiService.threads.listThreads({
                agentId,
                limit,
                scope: resolved.scope,
                spaceId,
              })
            ).threads,
        },
        limit: query.data.limit,
        locale: query.data.locale,
        spaceId: query.data.space_id,
      });
      return c.json(feed);
    } catch (error) {
      if (error instanceof AgentDeskNotFoundError) {
        return c.json({ error: `agent_desk.${error.code}` }, 404);
      }
      if (error instanceof EngentyCoreHttpError) {
        if (error.status === 401 || error.status === 403) {
          return c.json({ error: "agent_desk.forbidden" }, 403);
        }
        if (error.status === 404) {
          return c.json({ error: "agent_desk.space_not_found" }, 404);
        }
      }
      return handleRouteError(
        c,
        "failed to build agent desk feed",
        "agent_desk.internalError",
        error
      );
    }
  });

  const startersQuerySchema = z.object({
    agent_id: z.string().trim().min(1).max(128),
    locale: z.string().trim().min(2).max(16).default("en"),
    space_id: uuidString,
  });

  app.get(`${AI_BASE_PATH}/v1/agent-desk/starters`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = startersQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    const accessToken = scopeAccessToken(resolved.scope);
    const coreBaseUrl = options.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (!(accessToken && coreBaseUrl)) {
      return c.json({ starters: [], enabled: false });
    }
    const core = new EngentyCoreClient({
      accessToken,
      coreBaseUrl,
      fetchImpl: options.coreFetch,
    });
    try {
      const result = await generateAgentDeskStarters({
        agentId: query.data.agent_id,
        dependencies: {
          getAgent: (agentId) =>
            options
              .getRegistry(resolved.scope.tenantId)
              .getAgentConfig(agentId),
          getSpaceSurface: (spaceId) => core.getSpaceSurface(spaceId),
          getTenantSettings: () =>
            loadTenantAiSettings(resolved.scope.tenantId),
          listFirstUserMessages: async ({ threads }) => {
            const texts: string[] = [];
            for (const thread of threads.slice(0, 15)) {
              try {
                const { messages } =
                  await options.aiService.threads.listMessages({
                    limit: 8,
                    scope: resolved.scope,
                    threadId: thread.id,
                  });
                const firstUser = messages.find(
                  (message) => message.role === "user"
                );
                const text = firstUserTextFromParts(firstUser?.parts);
                if (text) {
                  texts.push(text);
                }
              } catch {
                // Best-effort history; missing a thread must not fail the page.
              }
            }
            return texts;
          },
          listSpaces: () => core.listSpaces(),
          listThreads: async ({ agentId, limit, spaceId }) =>
            (
              await options.aiService.threads.listThreads({
                agentId,
                limit,
                scope: resolved.scope,
                spaceId,
              })
            ).threads,
        },
        locale: query.data.locale,
        spaceId: query.data.space_id,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
      return c.json(result);
    } catch {
      return c.json({ enabled: true, starters: [] });
    }
  });

  // MEMORY.md — the agent's own notes for this Space, shown and edited on the
  // Manage tab. Same row the run's `memory_note` tool writes; the human edit
  // path applies the same cap. The storage prefixes the tenant like the run's
  // adapter does (`#resourceKey`), so the two never read different rows.
  const getMemoryStore = options.getMemoryStore ?? getMemoryResourceStore;
  const memoryQuerySchema = z.object({
    agent_id: z.string().trim().min(1).max(128),
    // A personal-scope agent's pads (the copilot's) are one row per person,
    // wherever they stand; a shared agent's are per space and need it.
    space_id: uuidString.optional(),
  });
  const memoryBodySchema = z.object({
    memory: z.string().max(AGENT_MEMORY_MAX_CHARS * 4),
  });

  const resolvePadIdentity = async (
    tenantId: string,
    userId: string,
    query: z.infer<typeof memoryQuerySchema>
  ) => {
    const config = await options
      .getRegistry(tenantId)
      .getAgentConfig(query.agent_id);
    if (!config) {
      return null;
    }
    return {
      agentId: query.agent_id,
      sharedObservations: resolveSharedObservationsScope(config),
      spaceId: query.space_id ?? null,
      tenantId,
      userId,
    };
  };
  const resolveMemoryRow = async (
    tenantId: string,
    userId: string,
    query: z.infer<typeof memoryQuerySchema>
  ) => {
    const identity = await resolvePadIdentity(tenantId, userId, query);
    const resourceId = identity ? agentMemoryResourceId(identity) : null;
    return resourceId ? `${tenantId}:${resourceId}` : null;
  };
  const resolveTasksRow = async (
    tenantId: string,
    userId: string,
    query: z.infer<typeof memoryQuerySchema>
  ) => {
    const identity = await resolvePadIdentity(tenantId, userId, query);
    const resourceId = identity ? agentTasksResourceId(identity) : null;
    return resourceId ? `${tenantId}:${resourceId}` : null;
  };

  app.get(`${AI_BASE_PATH}/v1/agent-desk/memory`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = memoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    try {
      const row = await resolveMemoryRow(
        resolved.scope.tenantId,
        resolved.scope.userId,
        query.data
      );
      const store = row ? await getMemoryStore() : null;
      const memory = row && store ? await readAgentMemory(store, row) : "";
      return c.json({
        enabled: row !== null,
        max_chars: AGENT_MEMORY_MAX_CHARS,
        memory,
      });
    } catch (error) {
      return handleRouteError(
        c,
        "failed to read agent memory",
        "agent_desk.internalError",
        error
      );
    }
  });

  app.put(`${AI_BASE_PATH}/v1/agent-desk/memory`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = memoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    const body = memoryBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json(
        { error: "agent_desk.invalidBody", details: body.error.issues },
        400
      );
    }
    try {
      const row = await resolveMemoryRow(
        resolved.scope.tenantId,
        resolved.scope.userId,
        query.data
      );
      const store = row ? await getMemoryStore() : null;
      if (!(row && store)) {
        return c.json({ error: "agent_desk.memoryUnavailable" }, 404);
      }
      const memory = await writeAgentMemory(store, row, body.data.memory);
      return c.json({
        enabled: true,
        max_chars: AGENT_MEMORY_MAX_CHARS,
        memory,
      });
    } catch (error) {
      if (error instanceof AgentMemoryTooLargeError) {
        return c.json(
          {
            error: "agent_desk.memoryTooLarge",
            length: error.length,
            max_chars: AGENT_MEMORY_MAX_CHARS,
          },
          413
        );
      }
      return handleRouteError(
        c,
        "failed to write agent memory",
        "agent_desk.internalError",
        error
      );
    }
  });

  // TASKS.md — the agent's own open items and goals for this audience, on the
  // same row as MEMORY.md (metadata). Private to the agent; a person may read
  // and correct it here. Writes are parsed and re-rendered canonically.
  const tasksBodySchema = z.object({
    tasks: z.string().max(AGENT_TASKS_MAX_CHARS * 4),
  });

  app.get(`${AI_BASE_PATH}/v1/agent-desk/tasks`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = memoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    try {
      const row = await resolveTasksRow(
        resolved.scope.tenantId,
        resolved.scope.userId,
        query.data
      );
      const store = row ? await getMemoryStore() : null;
      const tasks = row && store ? await readAgentTasks(store, row) : "";
      return c.json({
        enabled: row !== null,
        max_chars: AGENT_TASKS_MAX_CHARS,
        tasks,
      });
    } catch (error) {
      return handleRouteError(
        c,
        "failed to read agent tasks",
        "agent_desk.internalError",
        error
      );
    }
  });

  app.put(`${AI_BASE_PATH}/v1/agent-desk/tasks`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = memoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    const body = tasksBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json(
        { error: "agent_desk.invalidBody", details: body.error.issues },
        400
      );
    }
    try {
      const row = await resolveTasksRow(
        resolved.scope.tenantId,
        resolved.scope.userId,
        query.data
      );
      const store = row ? await getMemoryStore() : null;
      if (!(row && store)) {
        return c.json({ error: "agent_desk.tasksUnavailable" }, 404);
      }
      const tasks = await writeAgentTasks(store, row, body.data.tasks);
      return c.json({
        enabled: true,
        max_chars: AGENT_TASKS_MAX_CHARS,
        tasks,
      });
    } catch (error) {
      if (error instanceof AgentTasksTooLargeError) {
        return c.json(
          {
            error: "agent_desk.tasksTooLarge",
            length: error.length,
            max_chars: AGENT_TASKS_MAX_CHARS,
          },
          413
        );
      }
      return handleRouteError(
        c,
        "failed to write agent tasks",
        "agent_desk.internalError",
        error
      );
    }
  });

  const welcomeQuerySchema = z.object({
    agent_id: z.string().trim().min(1).max(128),
    locale: z.string().trim().min(2).max(16).default("en"),
    space_id: uuidString,
  });

  app.post(`${AI_BASE_PATH}/v1/agent-desk/welcome`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = welcomeQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "agent_desk.invalidQuery", details: query.error.issues },
        400
      );
    }
    const accessToken = scopeAccessToken(resolved.scope);
    const coreBaseUrl = options.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (!(accessToken && coreBaseUrl)) {
      return c.json({ error: "agent_desk.unconfiguredCore" }, 503);
    }
    const core = new EngentyCoreClient({
      accessToken,
      coreBaseUrl,
      fetchImpl: options.coreFetch,
    });
    try {
      const agent = await options
        .getRegistry(resolved.scope.tenantId)
        .getAgentConfig(query.data.agent_id);
      if (!agent) {
        return c.json({ error: "agent_desk.agent_not_found" }, 404);
      }
      const surface = await core.getSpaceSurface(query.data.space_id);
      if (!surface.agents.includes(agent.id)) {
        return c.json({ error: "agent_desk.forbidden" }, 403);
      }
      const result = await ensureHireWelcome({
        accessToken,
        agent,
        getSpaceSurface: () => Promise.resolve(surface),
        listSpaces: () => core.listSpaces(),
        locale: query.data.locale,
        ownerUserId: resolved.scope.userId,
        spaceId: query.data.space_id,
        tenantId: resolved.scope.tenantId,
      });
      if (!result) {
        return c.json({ error: "agent_desk.welcomeFailed" }, 503);
      }
      return c.json({
        created: result.created,
        thread_id: result.threadId,
      });
    } catch (error) {
      if (error instanceof AgentDeskNotFoundError) {
        return c.json({ error: `agent_desk.${error.code}` }, 404);
      }
      if (error instanceof EngentyCoreHttpError) {
        if (error.status === 401 || error.status === 403) {
          return c.json({ error: "agent_desk.forbidden" }, 403);
        }
        if (error.status === 404) {
          return c.json({ error: "agent_desk.space_not_found" }, 404);
        }
      }
      return handleRouteError(
        c,
        "failed to welcome hired agent",
        "agent_desk.internalError",
        error
      );
    }
  });
}

async function loadTenantAiSettings(tenantId: string) {
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return {};
  }
  try {
    const repo = createTenantSettingsRepoSupabase(
      factory.getTenantDb({ tenantId }),
      tenantId,
      "default"
    );
    const row = await repo.get(TENANT_AI_CONFIG_KEY);
    return parseTenantAiSettings(row?.value);
  } catch {
    return {};
  }
}
