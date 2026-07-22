import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import { resolveCoreAgentId } from "../ai/agent-identity.js";
import { listAllActions } from "../ai/module-actions.js";
import { buildAgentInstructions } from "../ai/registry/assemble-dynamic-agent.js";
import {
  type AgentConfig,
  type AiRegistry,
  agentConfigSchema,
  toolConfigSchema,
} from "../ai/registry/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RegistryStore } from "../dal/registry/index.js";
import { decorateAgentWithRole } from "./agent-role.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";
import { listModuleTools } from "./registry-module-tools.js";

/**
 * Mutating the shared agent registry (model overrides, per-agent budgets,
 * instructions) is a tenant-admin action, not something any authenticated
 * member may do. superadmin | tenant-admin | tenantRole==="admin" pass.
 */
function requireAgentAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: {
    isSuperAdmin?: boolean;
    isTenantAdmin?: boolean;
    tenantRole?: "admin" | "member" | null;
  }
): Response | null {
  if (
    scope.isSuperAdmin === true ||
    scope.isTenantAdmin === true ||
    scope.tenantRole === "admin"
  ) {
    return null;
  }
  return c.json({ error: "agent_sessions.forbidden" }, 403);
}

export interface RegisterRegistryRoutesOptions {
  getRegistry?: (tenantId: string) => AiRegistry;
  getStore: () => RegistryStore | null;
  // Tenant-scoped module capability channel — source of module ACTION.md defs.
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
}

type ListableAiRegistry = AiRegistry & {
  listAgentConfigs?: () => Promise<AgentConfig[]>;
};

function hasListableRegistry(
  registry: AiRegistry
): registry is ListableAiRegistry {
  return (
    "listAgentConfigs" in registry &&
    typeof registry.listAgentConfigs === "function"
  );
}

export function registerRegistryRoutes(
  app: Hono<any>,
  options: RegisterRegistryRoutesOptions
) {
  const { getRegistry, getStore, moduleLoader, scopeResolver } = options;

  app.get(`${AI_BASE_PATH}/registry/agents`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const registry = getRegistry?.(resolved.scope.tenantId);
      if (registry && hasListableRegistry(registry)) {
        const agents = await registry.listAgentConfigs();
        return c.json({ agents: agents.map(decorateAgentWithRole) });
      }

      const store = getStore();
      if (!store) {
        return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
      }
      const agents = await store.listAgents(resolved.scope.tenantId);
      return c.json({ agents: agents.map(decorateAgentWithRole) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list agents",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/registry/agents/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const agentId = c.req.param("id");
      const registry = getRegistry?.(resolved.scope.tenantId);
      const store = registry ? null : getStore();
      if (!(registry || store)) {
        return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
      }
      const agent = registry
        ? await registry.getAgentConfig(agentId)
        : await store?.getAgentConfig(resolved.scope.tenantId, agentId);
      if (!agent) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      return c.json({ agent: decorateAgentWithRole(agent) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  // Effective static system prompt (AGENTS.md + SOUL.md + skill hint), baked at
  // module load. Read-only insight; per-run runtime context is injected
  // separately and is NOT included here.
  app.get(`${AI_BASE_PATH}/registry/agents/:id/instructions`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const agentId = c.req.param("id");
      const registry = getRegistry?.(resolved.scope.tenantId);
      const store = registry ? null : getStore();
      const agent = registry
        ? await registry.getAgentConfig(agentId)
        : await store?.getAgentConfig(resolved.scope.tenantId, agentId);
      if (!agent) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      return c.json({
        instructions: buildAgentInstructions(agent),
        source: agent.source ?? null,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to resolve agent instructions",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/registry/agents`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const body = await c.req.json();
      const parsed = agentConfigSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_sessions.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      const agent = await store.upsertAgent(
        resolved.scope.tenantId,
        parsed.data
      );
      // Provision the core.agents security principal (mapping column) so
      // grants/audit can key on a stable uuid. Best-effort: an unlinked agent
      // is re-provisioned on next upsert or session load.
      await resolveCoreAgentId(resolved.scope.tenantId, agent.id);
      return c.json({ agent });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  // Governance list: every registry row incl. proposed/archived + pending
  // revisions — the approval UI reads this; assignment surfaces use the
  // default active-only list above.
  app.get(`${AI_BASE_PATH}/registry/agent-records`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const records = await store.listAgentRecords(resolved.scope.tenantId);
      return c.json({ records });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list agent records",
        "agent_sessions.internalError",
        err
      );
    }
  });

  // Agent-driven write path (the agent_propose tool). NEVER goes live:
  // a new agent lands status='proposed'; a revision to an active agent lands
  // in proposed_config while the agent keeps running its approved config.
  // Approve/reject below are deliberately NOT exposed as agent tools.
  app.post(`${AI_BASE_PATH}/registry/agents/:id/propose`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const body = await c.req.json();
      const { proposed_by_agent: proposedByAgent, ...configBody } = body as {
        proposed_by_agent?: string;
      } & Record<string, unknown>;
      const parsed = agentConfigSchema.safeParse({
        ...configBody,
        id: agentId,
      });
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_sessions.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      const record = await store.proposeAgent(
        resolved.scope.tenantId,
        parsed.data,
        { proposedByAgent: proposedByAgent ?? null }
      );
      return c.json({ record });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to propose agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/registry/agents/:id/approve`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const agent = await store.approveAgent(resolved.scope.tenantId, agentId);
      // Approval is go-live: provision the core.agents security principal.
      await resolveCoreAgentId(resolved.scope.tenantId, agent.id);
      return c.json({ agent });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to approve agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/registry/agents/:id/reject`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const rejected = await store.rejectAgent(
        resolved.scope.tenantId,
        agentId
      );
      return c.json({ rejected });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reject agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.patch(`${AI_BASE_PATH}/registry/agents/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const adminError = requireAgentAdmin(c, resolved.scope);
    if (adminError) {
      return adminError;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const existing = await store.getAgentConfig(
        resolved.scope.tenantId,
        agentId
      );
      if (!existing) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const body = await c.req.json();
      const parsed = agentConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_sessions.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      const merged = { ...existing, ...parsed.data, id: agentId };
      const agent = await store.upsertAgent(resolved.scope.tenantId, merged);
      await resolveCoreAgentId(resolved.scope.tenantId, agent.id);
      return c.json({ agent });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.delete(`${AI_BASE_PATH}/registry/agents/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const deleted = await store.deleteAgent(resolved.scope.tenantId, agentId);
      return c.json({ deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete agent",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/registry/tools`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const [tools, moduleTools] = await Promise.all([
        store.listTools(resolved.scope.tenantId),
        listModuleTools(moduleLoader, (message, err) =>
          console.warn(`[registry-routes] ${message}`, err)
        ),
      ]);
      return c.json({ tools: [...tools, ...moduleTools] });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list tools",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/registry/tools/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const tool = await store.getToolConfig(resolved.scope.tenantId, toolId);
      if (!tool) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      return c.json({ tool });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get tool",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/registry/tools`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const body = await c.req.json();
      const parsed = toolConfigSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_sessions.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      const tool = await store.upsertTool(resolved.scope.tenantId, parsed.data);
      return c.json({ tool });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create tool",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.patch(`${AI_BASE_PATH}/registry/tools/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const existing = await store.getToolConfig(
        resolved.scope.tenantId,
        toolId
      );
      if (!existing) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const body = await c.req.json();
      const parsed = toolConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_sessions.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      const tool = await store.upsertTool(resolved.scope.tenantId, {
        ...existing,
        ...parsed.data,
        id: toolId,
      });
      return c.json({ tool });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update tool",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/v1/actions`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const actions = (await listAllActions(moduleLoader)).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        agent_id: a.agent_id,
        module_id: a.module_id,
        default_thread_mode: a.default_thread_mode,
        input_schema_json: a.input_schema_json ?? null,
        // Read-only detail fields (admin catalog renders the spec from these).
        prompt: a.prompt ?? "",
        skills: a.skills ?? [],
        allowed_tools: a.allowed_tools ?? [],
        instruction_keys: a.instruction_keys ?? [],
        context_type: a.context_type ?? null,
      }));
      return c.json({ actions });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list actions",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.delete(`${AI_BASE_PATH}/registry/tools/:id`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const deleted = await store.deleteTool(resolved.scope.tenantId, toolId);
      return c.json({ deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete tool",
        "agent_sessions.internalError",
        err
      );
    }
  });
}
