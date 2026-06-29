// Generic per-run Mastra Workspace builder, driven by an agent's declarative
// `AgentConfig.workspace`. Replaces the old copilot-specific hook + hard-coded
// agent-type Set: any agent that declares a workspace gets one assembled from
// its expanded mount table and capability flags.
//
// Task checkout side-effects (run FK, session patch) stay in the harness; this
// hook only assembles the Workspace from already-resolved mounts.

import type { AgentWorkspaceConfig } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Workspace } from "@mastra/core/workspace";
import { getEngentyCoreBaseUrlFromEnv } from "../core-http-client.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { createSkillStorage } from "../skills/skill-storage.js";
import type { EngentyWorkspaceMountSpec } from "../workspace/contracts.js";
import { createEngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import { initEngentyAgentWorkspace } from "../workspace/loader.js";
import {
  collectManagedSkillPacks,
  ensureTenantManagedSkillsSeed,
} from "../workspace/tenant-skills-seed.js";
import { DEFAULT_SKILL_DISCOVERY_PATHS } from "../workspace/workspace-presets.js";
import type { AiSessionScope } from "./types.js";
import { resolveEngentyWorkspaceRuntimeSpec } from "./workspace-runtime-spec.js";

const logger = createLogger({ name: "ai.workspace.agent-hook" });

// Guard for the read-only managed skills sync (modules + builtin): seeded once
// per tenant per process. The seed itself is idempotent (writes only when
// absent), so a missed/duplicate call is harmless.
const seededSkillTenants = new Set<string>();

// Best-effort, one-time sync of code-provided skills into the read-only managed
// tier when the agent mounts `/skills`. Failures never block the run.
async function maybeSeedTenantManagedSkills(
  scope: AiSessionScope,
  skillDiscoveryPaths: string[]
): Promise<void> {
  const tenantId = scope.tenantId.trim();
  if (seededSkillTenants.has(tenantId) || skillDiscoveryPaths.length === 0) {
    return;
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const userAccessToken = scope.userAccessToken?.trim();
  if (!(coreBaseUrl && userAccessToken)) {
    return;
  }
  seededSkillTenants.add(tenantId);
  try {
    const packs = await collectManagedSkillPacks();
    if (packs.length === 0) {
      return;
    }
    const storage = createSkillStorage({
      storage: createEngentyCoreFileStorageClient({
        coreBaseUrl,
        userAccessToken,
      }),
      tenantId,
    });
    await ensureTenantManagedSkillsSeed({ packs, storage });
  } catch (error) {
    seededSkillTenants.delete(tenantId);
    logger.warn("tenant_managed_skills_seed_failed", {
      error: error instanceof Error ? error.message : String(error),
      tenant_id: tenantId,
    });
  }
}

// Skill discovery: explicit declaration paths win; otherwise infer `/skills`
// from a mounted skills dir. Empty result disables skill/search auto-tools.
function resolveSkillDiscoveryPaths(
  config: AgentWorkspaceConfig,
  mounts: EngentyWorkspaceMountSpec[]
): string[] {
  const declared = config.skills?.discoveryPaths;
  if (declared && declared.length > 0) {
    return [...new Set(declared)];
  }
  if (mounts.some((mount) => mount.mountPath === "/skills")) {
    return [...DEFAULT_SKILL_DISCOVERY_PATHS];
  }
  return [];
}

export async function buildAgentWorkspaceForRun(input: {
  agentId: string;
  mounts: EngentyWorkspaceMountSpec[];
  runId: string;
  scope: AiSessionScope;
  taskIdentifier?: string;
  threadId: string;
  workspaceConfig: AgentWorkspaceConfig;
}): Promise<{
  sandboxProvider?: EngentySandboxProvider;
  workspace: Workspace;
}> {
  const skillDiscoveryPaths = resolveSkillDiscoveryPaths(
    input.workspaceConfig,
    input.mounts
  );

  await maybeSeedTenantManagedSkills(input.scope, skillDiscoveryPaths);

  const sandboxEnabled = input.workspaceConfig.sandbox?.enabled ?? false;
  const sandboxLifecycle = input.workspaceConfig.sandbox?.lifecycle ?? "run";

  const { workspace, sandboxProvider } = await initEngentyAgentWorkspace(
    resolveEngentyWorkspaceRuntimeSpec({
      agentId: input.agentId,
      bm25: input.workspaceConfig.search?.bm25,
      enableSandbox: sandboxEnabled,
      enableSkillSearch: skillDiscoveryPaths.length > 0,
      enableVector: input.workspaceConfig.search?.vector ?? false,
      mounts: input.mounts,
      sandboxConfig: input.workspaceConfig.sandbox
        ? {
            lifecycle:
              sandboxLifecycle === "task" && input.taskIdentifier
                ? "task"
                : sandboxLifecycle,
            mountPath: input.workspaceConfig.sandbox.mountPath,
            provider: input.workspaceConfig.sandbox.provider,
            timeoutMs: input.workspaceConfig.sandbox.timeoutMs,
          }
        : undefined,
      sandboxIdentity: sandboxEnabled
        ? {
            runId: input.runId,
            tenantId: input.scope.tenantId,
            threadId: input.threadId,
            ...(input.taskIdentifier &&
            (input.workspaceConfig.sandbox?.lifecycle ?? "run") === "task"
              ? { taskIdentifier: input.taskIdentifier }
              : input.taskIdentifier
                ? { taskIdentifier: input.taskIdentifier }
                : {}),
          }
        : undefined,
      sandboxRequireApproval:
        input.workspaceConfig.sandbox?.requireApproval ?? true,
      scope: input.scope,
      ...(skillDiscoveryPaths.length > 0 ? { skillDiscoveryPaths } : {}),
    })
  );
  return { sandboxProvider, workspace };
}
