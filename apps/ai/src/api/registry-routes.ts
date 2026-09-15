import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { hiredAgentMountKeys, SPACE_AGENT_LIMIT } from "@engenty/plugin-sdk";
import type { Hono } from "hono";
import { z } from "zod";
import { resolveCoreAgentId } from "../ai/agent-identity.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import {
  createRoutineStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../ai/index.js";
import { listAllWorkflows } from "../ai/module-workflows.js";
import { buildAgentInstructions } from "../ai/registry/assemble-dynamic-agent.js";
import { resolveEffectiveCapabilities } from "../ai/registry/effective-capabilities.js";
import {
  AGENT_STARTER_MAX,
  type AgentConfig,
  type AiRegistry,
  agentConfigSchema,
  agentStarterSchema,
  toolConfigSchema,
} from "../ai/registry/types.js";
import { resolveRunSpaceById } from "../ai/sessions/run-space.js";
import {
  type AiSessionScope,
  scopeAccessToken,
  scopeCoversCapability,
} from "../ai/sessions.js";
import { mountAgentOnSpaces } from "../ai/space-mount-agent.js";
import { listPublishedWorkflowsRunningAgent } from "../ai/workflows/graph-agents.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RegistryStore } from "../dal/registry/index.js";
import { decorateAgentWithRole } from "./agent-role.js";
import { AI_CAPABILITIES } from "./capabilities.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";
import { listModuleTools } from "./registry-module-tools.js";

const spaceIdsSchema = z.array(z.string().uuid()).min(1);

/** The first of `spaceIds` that cannot take another hire, or null. */
async function firstSpaceAtAgentLimit(
  core: Pick<EngentyCoreClient, "listSpaceMounts">,
  spaceIds: readonly string[]
): Promise<string | null> {
  for (const spaceId of spaceIds) {
    const mounts = await core.listSpaceMounts(spaceId);
    if (hiredAgentMountKeys(mounts).length >= SPACE_AGENT_LIMIT) {
      return spaceId;
    }
  }
  return null;
}
const optionalSpaceIdSchema = z.string().uuid();
const proposedAgentConfigSchema = agentConfigSchema.extend({
  starters: z.array(agentStarterSchema).max(AGENT_STARTER_MAX).optional(),
});

/**
 * Mutating the shared agent registry (model overrides, per-agent budgets,
 * instructions) is a tenant-admin action, not something any authenticated
 * member may do.
 *
 * Gated on the capability rather than the admin booleans (AUTH-06): admins pass
 * via their `*`, members and service credentials are excluded because
 * `module.*` does not cover `core.*` — same outcome as the booleans, but now
 * grantable to a narrower role without widening anyone into full admin.
 */
function requireAgentAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: Pick<AiSessionScope, "capabilities">
): Response | null {
  if (scopeCoversCapability(scope, AI_CAPABILITIES.registryManage)) {
    return null;
  }
  return c.json({ error: "agent_registry.forbidden" }, 403);
}

export interface RegisterRegistryRoutesOptions {
  /**
   * Override for tests — production builds a client from the caller's bearer
   * and ENGENTY_CORE_BASE_URL so putSpaceMount runs as that user.
   */
  createCoreClient?: (accessToken: string) => EngentyCoreClient;
  getRegistry?: (tenantId: string) => AiRegistry;
  getStore: () => RegistryStore | null;
  // Tenant-scoped module capability channel — source of module workflow defs.
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  scopeResolver: AiScopeResolver;
  /** After a live hire: open its desk and leave a first message. */
  welcomeHiredAgent?: (input: {
    agent: AgentConfig;
    locale: string;
    scope: AiSessionScope;
    spaceIds: readonly string[];
  }) => Promise<{ spaceId: string; threadId: string }[]>;
}

function coreClientForScope(
  scope: AiSessionScope,
  createCoreClient?: (accessToken: string) => EngentyCoreClient
): EngentyCoreClient | null {
  const accessToken = scopeAccessToken(scope)?.trim();
  if (!accessToken) {
    return null;
  }
  if (createCoreClient) {
    return createCoreClient(accessToken);
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    return null;
  }
  return new EngentyCoreClient({ accessToken, coreBaseUrl });
}

// Required, not optional: this is what `hasListableRegistry` has already
// proven. Leaving it optional made the narrowing pointless — callers still had
// to re-check the method they had just guarded on.
type ListableAiRegistry = AiRegistry & {
  listAgentConfigs: () => Promise<AgentConfig[]>;
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
  const {
    createCoreClient,
    getRegistry,
    getStore,
    moduleLoader,
    scopeResolver,
  } = options;

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
        return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
      }
      const agents = await store.listAgents(resolved.scope.tenantId);
      return c.json({ agents: agents.map(decorateAgentWithRole) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list agents",
        "agent_registry.internalError",
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
        return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
      }
      const agent = registry
        ? await registry.getAgentConfig(agentId)
        : await store?.getAgentConfig(resolved.scope.tenantId, agentId);
      if (!agent) {
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      return c.json({ agent: decorateAgentWithRole(agent) });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get agent",
        "agent_registry.internalError",
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
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      return c.json({
        instructions: buildAgentInstructions(agent),
        source: agent.source ?? null,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to resolve agent instructions",
        "agent_registry.internalError",
        err
      );
    }
  });

  // The runtime tool and skill set by layer — the assemble pipeline run dry.
  // `?space_id=` adds the Space's visibility filter and its mounted skills,
  // resolved the way a run resolves them (the caller's access included).
  app.get(
    `${AI_BASE_PATH}/registry/agents/:id/effective-capabilities`,
    async (c) => {
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
          return c.json({ error: "agent_registry.notFound" }, 404);
        }
        const spaceIdRaw = c.req.query("space_id")?.trim();
        const spaceId = spaceIdRaw
          ? optionalSpaceIdSchema.safeParse(spaceIdRaw)
          : null;
        if (spaceId && !spaceId.success) {
          return c.json({ error: "agent_registry.invalidSpaceId" }, 400);
        }
        const spaceResolution = spaceId?.success
          ? await resolveRunSpaceById({
              scope: resolved.scope,
              spaceId: spaceId.data,
            })
          : null;
        const capabilities = await resolveEffectiveCapabilities({
          config: agent,
          registry: registry ?? null,
          spaceId: spaceId?.success ? spaceId.data : null,
          spaceResolution,
        });
        return c.json(capabilities);
      } catch (err) {
        return handleRouteError(
          c,
          "failed to resolve effective capabilities",
          "agent_registry.internalError",
          err
        );
      }
    }
  );

  /**
   * Tool ids an agent declares must be tools the registry can actually provide.
   * A hire naming MODULE OPERATION ids (`contacts_bulk_import`) instead of tool
   * ids used to be accepted and then arrive at runtime with nothing mounted —
   * the agent reported it had no interface and did nothing. Operations are
   * reached THROUGH the catalog and gated by approvals; they never belong here.
   */
  async function unresolvableToolIds(
    registry: ReturnType<NonNullable<typeof getRegistry>> | undefined,
    toolIds: readonly string[]
  ): Promise<string[]> {
    if (!(registry && "getTool" in registry)) {
      return [];
    }
    const unknown: string[] = [];
    for (const id of toolIds) {
      const tool = await (
        registry as { getTool: (id: string) => Promise<unknown> }
      )
        .getTool(id)
        .catch(() => undefined);
      if (!tool) {
        unknown.push(id);
      }
    }
    return unknown;
  }

  // Who a hire reports to in the spaces it is mounted on — routing for its
  // reports, written on the mount, never on the registry row.
  const reportsToSchema = z
    .string()
    .trim()
    .min(1)
    .max(256)
    .nullable()
    .optional();

  app.post(`${AI_BASE_PATH}/registry/agents`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const body = await c.req.json();
      const spaceIdsParsed = spaceIdsSchema.safeParse(body.spaceIds);
      if (!spaceIdsParsed.success) {
        return c.json(
          {
            error: "agent_registry.spaceRequired",
            details: spaceIdsParsed.error.issues,
          },
          400
        );
      }
      const parsed = agentConfigSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_registry.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      // Interface agents (copilot/coordinator/remote) are platform-placed by
      // the baseline mount — a registry row can never mint one.
      if (parsed.data.kind === "interface") {
        return c.json(
          {
            error: "agent_registry.invalidInput",
            message: 'kind "interface" cannot be registered or hired.',
          },
          400
        );
      }
      const unknownTools = await unresolvableToolIds(
        getRegistry?.(resolved.scope.tenantId),
        parsed.data.toolIds ?? []
      );
      if (unknownTools.length > 0) {
        return c.json(
          {
            error: "agent_registry.unknownTools",
            message:
              `These are not tool ids: ${unknownTools.join(", ")}. ` +
              "Module operations are reached through the catalog " +
              "(engenty_tool_execute) and pre-approved via approval grants — " +
              "they do not go in toolIds.",
            unknown_tool_ids: unknownTools,
          },
          400
        );
      }
      const core = coreClientForScope(resolved.scope, createCoreClient);
      // Core refuses the mount past the limit too; checking first keeps a
      // refused hire from leaving an unmounted row behind.
      const fullSpace = core
        ? await firstSpaceAtAgentLimit(core, spaceIdsParsed.data)
        : null;
      if (fullSpace) {
        return c.json(
          {
            error: "agent_registry.spaceAgentLimit",
            message: `This space already has ${SPACE_AGENT_LIMIT} engenties; remove one before hiring another.`,
            space_id: fullSpace,
          },
          422
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
      const reportsTo = reportsToSchema.safeParse(body.reportsTo);
      const mounted = core
        ? await mountAgentOnSpaces(core, agent.id, spaceIdsParsed.data, {
            ...(reportsTo.success && reportsTo.data !== undefined
              ? { reportsTo: reportsTo.data }
              : {}),
          })
        : spaceIdsParsed.data.map((spaceId) => ({
            error: "core_client_unavailable",
            ok: false as const,
            spaceId,
          }));
      const mountedOk = mounted
        .filter((row) => row.ok)
        .map((row) => row.spaceId);
      // Best-effort: a silent hire shows as Inactive on the Space home.
      const locale =
        c.req.header("accept-language")?.split(",")[0]?.trim() || "en";
      const welcome =
        mountedOk.length > 0 && options.welcomeHiredAgent
          ? await options
              .welcomeHiredAgent({
                agent,
                locale,
                scope: resolved.scope,
                spaceIds: mountedOk,
              })
              .catch(() => [])
          : [];
      return c.json({ agent, mounted, welcome });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create agent",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const records = await store.listAgentRecords(resolved.scope.tenantId);
      return c.json({ records });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list agent records",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const body = await c.req.json();
      const {
        proposed_by_agent: proposedByAgent,
        proposed_space_id,
        ...configBody
      } = body as {
        proposed_by_agent?: string;
        proposed_space_id?: string | null;
      } & Record<string, unknown>;
      const parsed = proposedAgentConfigSchema.safeParse({
        ...configBody,
        id: agentId,
      });
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_registry.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      let proposedSpaceId: string | null = null;
      if (
        typeof proposed_space_id === "string" &&
        proposed_space_id.trim().length > 0
      ) {
        const spaceParsed = optionalSpaceIdSchema.safeParse(proposed_space_id);
        if (!spaceParsed.success) {
          return c.json(
            {
              error: "agent_registry.invalidInput",
              details: spaceParsed.error.issues,
            },
            400
          );
        }
        proposedSpaceId = spaceParsed.data;
      }
      const record = await store.proposeAgent(
        resolved.scope.tenantId,
        parsed.data,
        {
          proposedByAgent: proposedByAgent ?? null,
          proposedSpaceId,
        }
      );
      return c.json({ record });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to propose agent",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const record = await store.getAgentRecord(
        resolved.scope.tenantId,
        agentId
      );
      if (!record) {
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      const wasNewProposal = record.status === "proposed";
      let overrideSpaceId: string | undefined;
      try {
        const body = (await c.req.json()) as { spaceId?: unknown };
        if (typeof body.spaceId === "string" && body.spaceId.trim()) {
          const parsed = optionalSpaceIdSchema.safeParse(body.spaceId);
          if (!parsed.success) {
            return c.json(
              {
                error: "agent_registry.invalidInput",
                details: parsed.error.issues,
              },
              400
            );
          }
          overrideSpaceId = parsed.data;
        }
      } catch {
        // Empty body is fine — use the stamped proposed_space_id.
      }
      const mountSpaceId = wasNewProposal
        ? (overrideSpaceId ?? record.proposed_space_id)
        : null;
      if (wasNewProposal && !mountSpaceId) {
        return c.json({ error: "agent_registry.spaceRequired" }, 400);
      }
      const agent = await store.approveAgent(resolved.scope.tenantId, agentId);
      // Approval is go-live: provision the core.agents security principal.
      await resolveCoreAgentId(resolved.scope.tenantId, agent.id);
      let mounted: Awaited<ReturnType<typeof mountAgentOnSpaces>> = [];
      if (wasNewProposal && mountSpaceId) {
        const core = coreClientForScope(resolved.scope, createCoreClient);
        mounted = core
          ? await mountAgentOnSpaces(core, agent.id, [mountSpaceId])
          : [
              {
                error: "core_client_unavailable",
                ok: false,
                spaceId: mountSpaceId,
              },
            ];
      }
      return c.json({ agent, mounted });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to approve agent",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
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
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      const existing = await store.getAgentConfig(
        resolved.scope.tenantId,
        agentId
      );
      if (!existing) {
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      const body = await c.req.json();
      const parsed = agentConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_registry.invalidInput",
            details: parsed.error.issues,
          },
          400
        );
      }
      // `.partial()` still applies the schema's `.default([])`s, so a patch
      // that names only `description` parsed as `toolIds: []` too and wiped
      // the row's tools and skills on every desk edit. Only fields the body
      // actually sent may change.
      const patch = Object.fromEntries(
        Object.entries(parsed.data).filter(([key]) => key in body)
      );
      const merged = { ...existing, ...patch, id: agentId };
      const agent = await store.upsertAgent(resolved.scope.tenantId, merged);
      await resolveCoreAgentId(resolved.scope.tenantId, agent.id);
      return c.json({ agent });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to update agent",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const agentId = c.req.param("id");
      // Referential guard: a published Workflow that runs this agent keeps
      // running after the row is gone — its next invocation fails with
      // unknownAgentType at 03:00, which is the worst place to learn about a
      // deletion. Deleting past the guard is a stated choice (?force=true),
      // never a surprise. Live-hit 2026-08-28: an orphaned "Monthly
      // Bookkeeping Intake" outlived its deleted specialist and failed on
      // the next invoke. The agent's OWN workflows are exempt — they are
      // deleted with it below, so they never outlive it.
      if (c.req.query("force") !== "true") {
        const referencing = await listPublishedWorkflowsRunningAgent({
          agentId,
          excludeOwnedBy: agentId,
          tenantId: resolved.scope.tenantId,
        });
        if (referencing.length > 0) {
          return c.json(
            {
              error: "agent_registry.referencedByWorkflows",
              workflows: referencing,
              message: `Published workflows still run this agent: ${referencing
                .map((entry) => entry.name)
                .join(
                  ", "
                )}. Retarget or delete them first, or pass ?force=true to delete anyway.`,
            },
            409
          );
        }
      }
      const deleted = await store.deleteAgent(resolved.scope.tenantId, agentId);
      if (deleted) {
        // The row is gone; nothing may keep pointing at it. Mount rows and
        // trigger bindings are cleaned server-side — best-effort per space,
        // because a mount that outlives its agent is inert (it names a
        // resource that no longer resolves) while a failed delete here would
        // resurrect nothing.
        const core = coreClientForScope(resolved.scope, createCoreClient);
        if (core) {
          try {
            const spaces = await core.listSpaces();
            await Promise.allSettled(
              spaces.map((space) =>
                core.deleteSpaceMount(space.id, "agent", agentId)
              )
            );
          } catch {
            // Unreachable core: the mounts stay until the next cleanup.
          }
        }
        // A routine whose specialist no longer exists can never run again —
        // DELETED with the agent, not paused (pausing is the unmount case,
        // where re-mounting brings a working setup back). Before the graphs:
        // a routine row RESTRICTs the workflow it binds.
        const routines = createRoutineStoreFromEnv();
        if (routines) {
          try {
            const owned = await routines.list({
              agentId,
              tenantId: resolved.scope.tenantId,
            });
            await Promise.allSettled(
              owned.map((routine) =>
                routines.delete({
                  id: routine.id,
                  tenantId: resolved.scope.tenantId,
                })
              )
            );
          } catch {
            // The scheduler sweep disables unresolvable owners as backstop.
          }
        }
        // The agent's own workflows go with it. Run history pins a version
        // (workflow_run RESTRICTs), and a foreign routine may still bind a
        // graph — those rows are disabled instead of removed, so the audit
        // trail survives and nothing can fire them.
        const flowGraphs = createWorkflowStoreFromEnv();
        if (flowGraphs) {
          try {
            const graphs = await flowGraphs.list({
              tenantId: resolved.scope.tenantId,
            });
            await Promise.allSettled(
              graphs
                .filter((graph) => graph.owner_agent_id === agentId)
                .map(async (graph) => {
                  try {
                    await flowGraphs.remove({
                      id: graph.id,
                      tenantId: resolved.scope.tenantId,
                    });
                  } catch {
                    await flowGraphs.setStatus({
                      id: graph.id,
                      status: "disabled",
                      tenantId: resolved.scope.tenantId,
                    });
                  }
                })
            );
          } catch {
            // Unreachable storage: disabled owners cannot fire regardless —
            // dispatch resolves the agent and refuses an unknown one.
          }
        }
      }
      return c.json({ deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete agent",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
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
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const tool = await store.getToolConfig(resolved.scope.tenantId, toolId);
      if (!tool) {
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      return c.json({ tool });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get tool",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const body = await c.req.json();
      const parsed = toolConfigSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_registry.invalidInput",
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
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const existing = await store.getToolConfig(
        resolved.scope.tenantId,
        toolId
      );
      if (!existing) {
        return c.json({ error: "agent_registry.notFound" }, 404);
      }
      const body = await c.req.json();
      const parsed = toolConfigSchema.partial().safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "agent_registry.invalidInput",
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
        "agent_registry.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/v1/workflows/catalog`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const workflows = (await listAllWorkflows(moduleLoader)).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        agent_id: a.owner_agent_id ?? null,
        module_id: a.module_id,
        input_schema_json: a.definition.inputSchema,
        skills: a.skills ?? [],
        allowed_tools: a.allowed_tools ?? [],
        context_type: a.context_type ?? null,
      }));
      return c.json({ workflows });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list actions",
        "agent_registry.internalError",
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
      return c.json({ error: "agent_registry.unconfiguredDatabase" }, 503);
    }
    try {
      const toolId = c.req.param("id");
      const deleted = await store.deleteTool(resolved.scope.tenantId, toolId);
      return c.json({ deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete tool",
        "agent_registry.internalError",
        err
      );
    }
  });
}
