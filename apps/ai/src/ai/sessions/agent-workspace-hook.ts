// Generic per-run Mastra Workspace builder, driven by an agent's declarative
// `AgentConfig.workspace`. Replaces the old copilot-specific hook + hard-coded
// agent-type Set: any agent that declares a workspace gets one assembled from
// its expanded mount table and capability flags.
//
// Task checkout side-effects (run FK, session patch) stay in the harness; this
// hook only assembles the Workspace from already-resolved mounts.

import type {
  AgentWorkspaceConfig,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Workspace } from "@mastra/core/workspace";
import { resolveCoreAgentId } from "../agent-identity.js";
import { getEngentyCoreBaseUrlFromEnv } from "../core-http-client.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import { resolveSpaceComputerNetworkTier } from "../sandbox/sandbox-env.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { createSkillStorage } from "../skills/skill-storage.js";
import {
  builtinPlatformSkillNames,
  resolveAllowedSkillNames,
  skillNamesByModuleFromCapabilities,
} from "../workspace/allowed-skills.js";
import type { EngentyWorkspaceMountSpec } from "../workspace/contracts.js";
import { createEngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import { initEngentyAgentWorkspace } from "../workspace/loader.js";
import { syncTenantManagedSkills } from "../workspace/tenant-skills-seed.js";
import { DEFAULT_SKILL_DISCOVERY_PATHS } from "../workspace/workspace-presets.js";
import {
  type RunSpace,
  type RunSpaceResolution,
  resolvedRunSpace,
} from "./run-space.js";
import { type AiSessionScope, scopeAccessToken } from "./types.js";
import { resolveEngentyWorkspaceRuntimeSpec } from "./workspace-runtime-spec.js";

const logger = createLogger({ name: "ai.workspace.agent-hook" });

// Best-effort sync of code-provided skills into the read-only managed tier when
// the agent mounts `/skills`. Failures never block the run. Deduped per tenant
// per process inside syncTenantManagedSkills (shared with the catalog routes).
async function maybeSeedTenantManagedSkills(
  scope: AiSessionScope,
  skillDiscoveryPaths: string[]
): Promise<void> {
  const tenantId = scope.tenantId.trim();
  if (skillDiscoveryPaths.length === 0) {
    return;
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = scopeAccessToken(scope)?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return;
  }
  try {
    const storage = createSkillStorage({
      storage: createEngentyCoreFileStorageClient({
        coreBaseUrl,
        accessToken,
      }),
      tenantId,
    });
    await syncTenantManagedSkills({ storage, tenantId });
  } catch (error) {
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

function mountedModuleIdsFromRunSpace(space: RunSpace): string[] {
  const ids = new Set<string>();
  for (const moduleId of space.moduleIds) {
    const trimmed = moduleId.trim();
    if (trimmed) {
      ids.add(trimmed);
    }
  }
  for (const mount of space.surface.modules) {
    if (mount.agentAccess === "none") {
      continue;
    }
    const moduleId = mount.moduleId.trim();
    if (moduleId) {
      ids.add(moduleId);
    }
  }
  return [...ids];
}

/**
 * Allowed `/skills` directory names for a run.
 *
 * - `global` (or omitted resolution) → `undefined` (no filter)
 * - `unresolved` → `[]` (hide every skill; never look like "no skills exist")
 * - `resolved` → union from the Space surface, mounted-module ownership,
 *   preferred agent skills, and builtin platform skills
 */
export async function resolveAllowedSkillNamesForWorkspaceRun(input: {
  moduleCapabilityLoader?: Pick<
    DynamicAiModuleCapabilityLoader,
    "listModuleCapabilities"
  >;
  preferredSkillNames?: readonly string[];
  spaceResolution?: RunSpaceResolution;
}): Promise<string[] | undefined> {
  const resolution = input.spaceResolution;
  if (!resolution || resolution.kind === "global") {
    return;
  }
  if (resolution.kind === "unresolved") {
    return [];
  }

  const runSpace = resolvedRunSpace(resolution);
  const loader =
    input.moduleCapabilityLoader ?? createDefaultModuleCapabilityLoader();
  const capabilities = await loader.listModuleCapabilities();

  return resolveAllowedSkillNames({
    kind: "resolved",
    explicitSkillNames: runSpace?.surface.skills,
    moduleSkills: skillNamesByModuleFromCapabilities(capabilities),
    mountedModuleIds: runSpace ? mountedModuleIdsFromRunSpace(runSpace) : [],
    platformSkillNames: builtinPlatformSkillNames(),
    preferredSkillNames: input.preferredSkillNames,
  });
}

export async function buildAgentWorkspaceForRun(input: {
  agentId: string;
  moduleCapabilityLoader?: Pick<
    DynamicAiModuleCapabilityLoader,
    "listModuleCapabilities"
  >;
  mounts: EngentyWorkspaceMountSpec[];
  preferredSkillNames?: readonly string[];
  runId: string;
  scope: AiSessionScope;
  spaceResolution?: RunSpaceResolution;
  taskIdentifier?: string;
  threadId: string;
  workspaceConfig: AgentWorkspaceConfig;
}): Promise<{
  /**
   * One prompt section naming the run's actual compute: execution on/off,
   * network tier, and what that means for installs. Exists because the model
   * cannot see its own HostConfig — a network-none specialist otherwise
   * retries `pip install` forever and reads the failure as a bug.
   */
  computeInstructions?: string;
  sandboxProvider?: EngentySandboxProvider;
  workspace: Workspace;
}> {
  const skillDiscoveryPaths = resolveSkillDiscoveryPaths(
    input.workspaceConfig,
    input.mounts
  );

  await maybeSeedTenantManagedSkills(input.scope, skillDiscoveryPaths);

  const sandboxEnabled = input.workspaceConfig.sandbox?.enabled ?? false;
  const declaredLifecycle = input.workspaceConfig.sandbox?.lifecycle ?? "run";
  // Only a RESOLVED space roots the sandbox: an unresolved claim must not be
  // able to pick the staging prefix it lands in.
  const runSpace = input.spaceResolution
    ? resolvedRunSpace(input.spaceResolution)
    : undefined;
  const sandboxSpaceId = runSpace?.spaceId;
  const sandboxLifecycle = resolveRunSandboxLifecycle({
    declared: declaredLifecycle,
    spaceResolved: Boolean(sandboxSpaceId),
  });
  // The space's own reach setting, falling back to the host default. Computed
  // once so the container the run gets and the sentence its prompt reads can
  // never disagree.
  const spaceComputerNetwork = resolveSpaceComputerNetworkTier(
    runSpace?.surface.computerNetworkTier
  );
  const allowedSkillNames = await resolveAllowedSkillNamesForWorkspaceRun({
    ...(input.moduleCapabilityLoader
      ? { moduleCapabilityLoader: input.moduleCapabilityLoader }
      : {}),
    preferredSkillNames: input.preferredSkillNames,
    spaceResolution: input.spaceResolution,
  });

  // Only the `/data` mount forwards agent identity to core, and resolving it
  // can mint a principal — so it is looked up when that mount is in the table
  // and skipped otherwise.
  const coreAgentId = input.mounts.some((mount) => mount.kind === "data")
    ? await resolveCoreAgentId(input.scope.tenantId, input.agentId)
    : null;

  const { workspace, sandboxProvider } = await initEngentyAgentWorkspace(
    resolveEngentyWorkspaceRuntimeSpec({
      agentId: input.agentId,
      ...(allowedSkillNames === undefined ? {} : { allowedSkillNames }),
      bm25: input.workspaceConfig.search?.bm25,
      ...(input.workspaceConfig.disabledWorkspaceTools
        ? {
            disabledWorkspaceTools:
              input.workspaceConfig.disabledWorkspaceTools,
          }
        : {}),
      ...(coreAgentId ? { coreAgentId } : {}),
      enableSandbox: sandboxEnabled,
      enableSkillSearch: skillDiscoveryPaths.length > 0,
      enableVector: input.workspaceConfig.search?.vector ?? false,
      mounts: input.mounts,
      sandboxConfig: input.workspaceConfig.sandbox
        ? {
            lifecycle: sandboxLifecycle,
            mountPath: input.workspaceConfig.sandbox.mountPath,
            network: input.workspaceConfig.sandbox.network,
            provider: input.workspaceConfig.sandbox.provider,
            timeoutMs: input.workspaceConfig.sandbox.timeoutMs,
          }
        : undefined,
      ...(sandboxLifecycle === "space" ? { spaceComputerNetwork } : {}),
      sandboxIdentity: sandboxEnabled
        ? {
            runId: input.runId,
            ...(sandboxSpaceId ? { spaceId: sandboxSpaceId } : {}),
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
  return {
    sandboxProvider,
    workspace,
    ...(sandboxEnabled
      ? {
          computeInstructions: buildComputeInstructions(
            sandboxLifecycle === "space"
              ? spaceComputerNetwork
              : (input.workspaceConfig.sandbox?.network ?? "none"),
            sandboxLifecycle === "space"
          ),
        }
      : {}),
  };
}

/**
 * Where one run's sandbox lives (PLAN-agent-computers.md §1.2).
 *
 * Run-lifecycle sandboxes always target the space's shared machine — the
 * machine is keyed by the space, so a run with no resolved space falls back to
 * a per-run lease. Declarations keep their overrides — `task` stays on the
 * task checkout when the run is task-bound, and `session` (CLI, Copilot)
 * keeps its per-conversation container; both are continuity mechanisms of
 * their own.
 */
export function resolveRunSandboxLifecycle(input: {
  declared: "run" | "session" | "task";
  spaceResolved: boolean;
}): "run" | "session" | "task" | "space" {
  if (input.declared === "run" && input.spaceResolved) {
    return "space";
  }
  return input.declared;
}

function buildComputeInstructions(
  network: string,
  onSpaceComputer = false
): string {
  const networkLine =
    network === "egress"
      ? "- Network: outbound through an allowlist proxy (package registries " +
        "work; arbitrary hosts may be refused — report a refused host " +
        "instead of retrying it)."
      : "- Network: NONE. Package installs and web requests from the sandbox " +
        "will fail — do not retry them; use your tools for external data " +
        "and prebaked libraries (httpx, requests, zod) for code.";
  const executionLine = onSpaceComputer
    ? "- Execution: this Space's shared computer (node, bun, python3, uv, " +
      "jq). It persists between runs — installed packages and files in " +
      "/sandbox stay — and is shared with the Space's other agents, so " +
      "commands may briefly queue behind theirs."
    : "- Execution: a per-run sandbox (node, bun, python3, uv, jq). Created " +
      "on your first command, destroyed when the run ends; anything worth " +
      "keeping goes to your mounted folders, never the sandbox scratch.";
  return [
    "## Your computer",
    executionLine,
    networkLine,
    "- Package caches are warm per Space — a second install of the same " +
      "package is fast.",
  ].join("\n");
}
