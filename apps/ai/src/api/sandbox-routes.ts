import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import {
  destroyEngentySandboxesForScope,
  listEngentySandboxesForScope,
} from "../ai/sandbox/engenty-sandbox-catalog.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/agent-sessions/agent-run-store.js";
import type { AgentSessionStore } from "../dal/agent-sessions/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const killSandboxesBodySchema = z.object({
  sandbox_ids: z.array(z.string().min(1).max(256)).optional(),
});

export function registerSandboxRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getRunStore?: () => AgentRunStore | null;
    getSessionStore: () => AgentSessionStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/sandboxes`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = opts.getSessionStore();
    if (!store) {
      return c.json({ error: "agent_sandboxes.unconfiguredDatabase" }, 503);
    }
    try {
      const sandboxes = await listEngentySandboxesForScope({
        getRunStore: opts.getRunStore,
        scope: scope.scope,
        store,
      });
      return c.json({ sandboxes });
    } catch (err) {
      return handleRouteError(
        c,
        "listSandboxes failed",
        "agent_sandboxes.listFailed",
        err
      );
    }
  });

  app.delete(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = opts.getSessionStore();
    if (!store) {
      return c.json({ error: "agent_sandboxes.unconfiguredDatabase" }, 503);
    }
    const body = killSandboxesBodySchema.safeParse(
      c.req.header("content-type")?.includes("application/json")
        ? await c.req.json().catch(() => ({}))
        : {}
    );
    if (!body.success) {
      return c.json({ error: "agent_sandboxes.invalidBody" }, 400);
    }
    try {
      const result = await destroyEngentySandboxesForScope({
        getRunStore: opts.getRunStore,
        sandboxIds: body.data.sandbox_ids,
        scope: scope.scope,
        store,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "destroySandboxes failed",
        "agent_sandboxes.destroyFailed",
        err
      );
    }
  });
}
