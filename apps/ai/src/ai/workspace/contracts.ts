import { z } from "zod";

/** Tenant-scoped mount for Mastra workspace filesystem providers. */
export const engentyWorkspaceMountSpecSchema = z.object({
  mountPath: z.string().min(1),
  fileStorageRelativePath: z.string().min(1),
  readOnly: z.boolean().optional(),
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
  model: z.string().min(1),
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
  /** Gate sandbox EXECUTE_COMMAND behind human approval (HITL) when true. */
  sandboxRequireApproval: z.boolean().default(true),
  sandboxConfig: z
    .object({
      lifecycle: z.enum(["run", "session", "task"]).default("run"),
      mountPath: z.string().min(1).default("/sandbox"),
      provider: z.enum(["docker", "local"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
  sandboxIdentity: z
    .object({
      runId: z.string().min(1),
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
