import { z } from "zod";

/**
 * Tenant-scoped mount for Mastra workspace filesystem providers.
 *
 * `spaceId` selects the ROOT the relative path hangs off: absent means the
 * tenant root (`tenants/<t>/…` — skills, the user/agent home, the tenant
 * commons), present means the space root (`tenants/<t>/spaces/<s>/…` — the
 * space commons and every work container inside it). The relative path is
 * identical either way, which is what lets one mount table serve both.
 */
export const engentyWorkspaceMountSpecSchema = z.object({
  mountPath: z.string().min(1),
  fileStorageRelativePath: z.string().min(1),
  /**
   * `data` marks the space's DATA TREE rather than an object-store prefix
   * (PLAN-space-data.md D4). Its `fileStorageRelativePath` is a label, not a
   * key: the mount serves module records through the operation pipeline, so
   * there are no bytes at rest under any prefix and nothing to stage.
   */
  kind: z.enum(["data", "storage"]).optional(),
  /**
   * A host folder served as-is instead of an object-store prefix — the
   * `/company/apps/<slug>` source trees, which live only in app-host's tree.
   * Always read-only; `fileStorageRelativePath` is then a label.
   */
  localPath: z.string().min(1).optional(),
  readOnly: z.boolean().optional(),
  spaceId: z.string().min(1).optional(),
});

export type EngentyWorkspaceMountSpec = z.infer<
  typeof engentyWorkspaceMountSpecSchema
>;

/**
 * Workspace-backed dynamic agent definition.
 * Skill bodies resolve from filesystem paths (SKILL.md), not inline DB blobs.
 */
export const engentyWorkspaceAgentConfigSchema = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
  instructions: z.string().default(""),
  name: z.string().min(1),
  skillPaths: z.array(z.string().min(1)).default([]),
  subAgents: z
    .array(
      z.object({
        alias: z.string().optional(),
        id: z.string().min(1),
      })
    )
    .default([]),
  tenantId: z.string().min(1),
  toolIds: z.array(z.string().min(1)).default([]),
});

export type EngentyWorkspaceAgentConfig = z.infer<
  typeof engentyWorkspaceAgentConfigSchema
>;

/** Runtime workspace factory inputs for apps/ai harness. */
export const engentyWorkspaceRuntimeSpecSchema = z.object({
  agentConfig: engentyWorkspaceAgentConfigSchema,
  enableSandbox: z.boolean().default(false),
  /**
   * Mastra workspace tools to leave off this run, by `mastra_workspace_*` name.
   * Mastra attaches the whole set whenever a workspace exists and every schema
   * rides in the prompt on each model call, so an archetype that will never
   * call one should not carry it.
   */
  disabledWorkspaceTools: z.array(z.string().min(1)).default([]),
  /** Gate sandbox EXECUTE_COMMAND behind human approval (HITL) when true. */
  sandboxRequireApproval: z.boolean().default(true),
  /**
   * Force an approval on EVERY workspace delete, not just the dangerous ones.
   *
   * Absent, the guard decides per call from the args: recursive deletes and
   * anything on a shared, containment or `/data` mount ask, while an agent
   * tidying a single file in its own `/home` does not. Set true to author an
   * archetype stricter than that. There is deliberately NO value meaning
   * "never ask" — that would be fail-open on the one tool that cannot be undone.
   */
  filesRequireApproval: z.boolean().optional(),
  sandboxConfig: z
    .object({
      // `space` is never declared by an agent — the space's compute settings
      // route a run onto the space computer (PLAN-space-computer.md §1.3).
      lifecycle: z.enum(["run", "session", "task", "space"]).default("run"),
      mountPath: z.string().min(1).default("/sandbox"),
      /** Network reach: `none` (default) or `egress` via the host's proxy. */
      network: z.enum(["none", "egress"]).default("none"),
      provider: z.enum(["docker", "local"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
  /**
   * Network reach of the SPACE computer, from the space's own setting. Only
   * read when the run lands on `lifecycle: "space"`; a per-run sandbox uses
   * the agent's declared `sandboxConfig.network` instead.
   */
  spaceComputerNetwork: z.enum(["none", "egress"]).optional(),
  /** The Space's own egress hosts (`core.spaces.computer_egress_hosts`). */
  spaceComputerEgressHosts: z.array(z.string()).optional(),
  sandboxIdentity: z
    .object({
      runId: z.string().min(1),
      /**
       * Space the run belongs to. Roots the sandbox's scratch and its package
       * caches under the space, so two spaces in one tenant never share a
       * staging dir — and so the compute broker can meter per space.
       */
      spaceId: z.string().min(1).optional(),
      taskIdentifier: z.string().optional(),
      tenantId: z.string().min(1),
      threadId: z.string().min(1),
    })
    .optional(),
  enableSkillSearch: z.boolean().default(true),
  bm25: z.boolean().optional(),
  /** Opt into hybrid (BM25 + vector) search; activates only when env-configured. */
  enableVector: z.boolean().default(false),
  /** Stable per-tenant vector index name (valid SQL identifier). */
  searchIndexName: z.string().min(1).optional(),
  /** Override computed skill discovery paths (e.g. copilot `/tenant-skills`). */
  skillDiscoveryPaths: z.array(z.string().min(1)).optional(),
  /**
   * Skill directory names visible on the tenant `/skills` mount for this run.
   *
   * Present (including `[]`) wraps the skill filesystem so list/read/search
   * hide every other skill directory. Storage stays a single tenant copy.
   * Omit only for an intentional tenant-global run — never because a claimed
   * Space failed to load.
   */
  allowedSkillNames: z.array(z.string().min(1)).optional(),
  /**
   * The run agent's `core.agents` principal uuid, forwarded as
   * `x-engenty-agent-id` by the `/data` mount.
   *
   * NOT `agentConfig.id`: that is the AI-plane text key (`engenty.copilot`),
   * while core keys agent grants on a uuid (`core.role_assignments.agent_id`).
   * Sending the key made every agent-driven data call fail the escalation
   * policy's role-grant lookup with a Postgres cast error. Resolve it with
   * `resolveCoreAgentId`; absent means agent identity simply is not forwarded
   * and the agent-aware policy gates stay dormant, as elsewhere.
   */
  coreAgentId: z.string().min(1).optional(),
  /** Core bearer access for tenant file storage mounts (Phase 2). */
  fileStorageAccess: z
    .object({
      coreBaseUrl: z.string().min(1),
      accessToken: z.string().min(1),
    })
    .optional(),
  mounts: z.array(engentyWorkspaceMountSpecSchema).default([]),
  workspaceFsMode: z.preprocess(
    (value) => (value === "file-storage" ? "remote" : value),
    z.enum(["local", "remote"]).optional()
  ),
});

export type EngentyWorkspaceRuntimeSpec = z.infer<
  typeof engentyWorkspaceRuntimeSpecSchema
>;

/**
 * Pre-parse runtime spec shape (defaults still optional). The runtime-spec
 * builder produces this; the loader parses it into EngentyWorkspaceRuntimeSpec.
 */
export type EngentyWorkspaceRuntimeSpecInput = z.input<
  typeof engentyWorkspaceRuntimeSpecSchema
>;

export function parseEngentyWorkspaceAgentConfig(
  input: unknown
): EngentyWorkspaceAgentConfig {
  return engentyWorkspaceAgentConfigSchema.parse(input);
}

export function parseEngentyWorkspaceRuntimeSpec(
  input: unknown
): EngentyWorkspaceRuntimeSpec {
  return engentyWorkspaceRuntimeSpecSchema.parse(input);
}

/** Default tenant-relative skill discovery paths (file storage layout). */
export function defaultTenantSkillPaths(tenantId: string): string[] {
  return [
    `tenants/${tenantId}/ai/skills`,
    `tenants/${tenantId}/ai/workspace/skills`,
  ];
}

/** Map legacy DB agent row shape into workspace agent config (metadata only). */
export function mapRegistryRowToWorkspaceAgentConfig(input: {
  agent_id: string;
  description?: string | null;
  instructions: string;
  model: string;
  name: string;
  skill_ids: string[];
  sub_agents: { alias?: string; id: string }[];
  tenant_id: string;
  tool_ids: string[];
}): EngentyWorkspaceAgentConfig {
  return engentyWorkspaceAgentConfigSchema.parse({
    description: input.description ?? undefined,
    id: input.agent_id,
    instructions: input.instructions,
    model: input.model,
    name: input.name,
    skillPaths: input.skill_ids.map((skillId) => `skills/${skillId}`),
    subAgents: input.sub_agents,
    tenantId: input.tenant_id,
    toolIds: input.tool_ids,
  });
}
