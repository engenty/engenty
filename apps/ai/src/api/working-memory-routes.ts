// Working-memory profile API — the read-only "what the assistant knows about
// you" settings view + reset. The profile is resource-scoped working memory
// maintained by the agent (see concrete-memory.ts); rows live in
// ai.mastra_resources keyed `${tenantId}:${userId}`. The copilot's TASKS.md
// (its own open items, `metadata.tasks_md`) is read and edited under
// `/working/tasks`; it lives on the copilot's MEMORY.md row — the personal
// shared-observation resource for this agent and person — not on the profile.
import type { AiRegistry } from "@engenty/ai-core";
import type { Hono } from "hono";
import { z } from "zod";
import {
  AGENT_TASKS_MAX_CHARS,
  AgentTasksTooLargeError,
  agentTasksResourceId,
  readAgentTasks,
  writeAgentTasks,
} from "../ai/memory/agent-tasks.js";
import { resolveSharedObservationsScope } from "../ai/memory/shared-observational-memory.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";
import { getMemoryResourceStore as getResourceStore } from "./memory-resource-store.js";

const COPILOT_AGENT_ID = "engenty.copilot";

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

  // The copilot's TASKS.md. Editable: it is the agent's own pad, and the
  // person may correct it like a specialist's on the desk. The row is derived
  // exactly as the run derives it — from the copilot's registered config —
  // so the page and the `todo_edit` tool never read different rows.
  const tasksBodySchema = z.object({
    tasks: z.string().max(AGENT_TASKS_MAX_CHARS * 4),
  });
  const copilotTasksRow = async (scope: {
    tenantId: string;
    userId: string;
  }) => {
    const config = await options
      .getRegistry(scope.tenantId)
      .getAgentConfig(COPILOT_AGENT_ID);
    if (!config) {
      return null;
    }
    const resourceId = agentTasksResourceId({
      agentId: COPILOT_AGENT_ID,
      sharedObservations: resolveSharedObservationsScope(config),
      tenantId: scope.tenantId,
      userId: scope.userId,
    });
    return resourceId ? `${scope.tenantId}:${resourceId}` : null;
  };

  app.get(`${base}/tasks`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const store = await getResourceStore();
      const row = await copilotTasksRow(resolved.scope);
      const tasks = store && row ? await readAgentTasks(store, row) : "";
      return c.json({
        enabled: Boolean(store && row),
        max_chars: AGENT_TASKS_MAX_CHARS,
        tasks,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read copilot tasks",
        "memory.internalError",
        err
      );
    }
  });

  app.put(`${base}/tasks`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const body = tasksBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json(
        { error: "memory.invalidBody", details: body.error.issues },
        400
      );
    }
    try {
      const store = await getResourceStore();
      const row = await copilotTasksRow(resolved.scope);
      if (!(store && row)) {
        return c.json({ error: "memory.tasksUnavailable" }, 404);
      }
      const tasks = await writeAgentTasks(store, row, body.data.tasks);
      return c.json({ enabled: true, max_chars: AGENT_TASKS_MAX_CHARS, tasks });
    } catch (err) {
      if (err instanceof AgentTasksTooLargeError) {
        return c.json(
          {
            error: "memory.tasksTooLarge",
            length: err.length,
            max_chars: AGENT_TASKS_MAX_CHARS,
          },
          413
        );
      }
      return handleRouteError(
        c,
        "failed to write copilot tasks",
        "memory.internalError",
        err
      );
    }
  });
}
