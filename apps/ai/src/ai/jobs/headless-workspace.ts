// The workspace a headless run gets — task jobs and routine fires alike.
//
// Both lanes ran without one for a long time, which meant the SAME agent had
// two different worlds depending on how it was reached: a chat gave it
// `/home /shared /space /skills /task /routine /project /data` plus a sandbox,
// while a dispatched run of the same declaration got a couple of flat storage
// tools and no way to execute anything. An agent that can write and run a
// script when a person is watching, and cannot when a schedule fires it, is not
// the same agent — and routines are exactly where that capability matters most.
//
// So this is the chat lane's own resolver, called from the headless lanes. No
// new mechanism: the declaration expands into the same mount table, and
// `buildAgentWorkspaceForRun` assembles the same Mastra workspace.
import {
  type AgentWorkspaceConfig,
  agentWorkspaceConfigSchema,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Workspace } from "@mastra/core/workspace";

import type { AiRegistry } from "../registry/index.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { buildAgentWorkspaceForRun } from "../sessions/agent-workspace-hook.js";
import type { RunSpaceResolution } from "../sessions/run-space.js";
import type { AiSessionScope } from "../sessions/types.js";
import { mergeDeclaredWorkspaceMounts } from "../workspace/sandbox-mounts.js";
import {
  buildEngentyMountSpecs,
  expandWorkspaceMounts,
} from "../workspace/workspace-presets.js";

const logger = createLogger({ name: "apps/ai/headless-workspace" });

/**
 * What an agent gets headless when its declaration says nothing.
 *
 * DB-registered agents (`agent_propose`) have no workspace column at all, so
 * without a default every one of them would run with no files. `staff` is the
 * archetype that matches what they are: company resources with an agent-scoped
 * `/home`, not a person's desk. This is a policy default for a lane that never
 * had declarations — not a compatibility fallback for one that did.
 */
const HEADLESS_DEFAULT_WORKSPACE: AgentWorkspaceConfig =
  agentWorkspaceConfigSchema.parse({ enabled: true, preset: "staff" });

export interface HeadlessWorkspaceResult {
  /** The run's compute section for the prompt — see agent-workspace-hook. */
  computeInstructions?: string;
  sandboxProvider?: EngentySandboxProvider;
  workspace: Workspace;
}

/**
 * Build the run's workspace from the agent's declaration.
 *
 * Returns undefined when the agent opted out (`enabled: false`) or when every
 * declared mount needed a binding this run does not have — a run with no
 * resolvable mounts gets no workspace rather than an empty one.
 */
export async function buildHeadlessWorkspace(input: {
  agentId: string;
  projectId?: string;
  registry: Pick<AiRegistry, "getAgentConfig">;
  /** The routine whose fire this run is; roots its `/routine` folder. */
  routineId?: string;
  runId: string;
  scope: AiSessionScope;
  spaceId?: string;
  spaceResolution?: RunSpaceResolution;
  taskIdentifier?: string;
  threadId: string;
}): Promise<HeadlessWorkspaceResult | undefined> {
  const declared = await input.registry.getAgentConfig?.(input.agentId);
  const workspaceConfig = declared?.workspace ?? HEADLESS_DEFAULT_WORKSPACE;
  if (workspaceConfig.enabled === false) {
    return;
  }

  const declaredMounts = mergeDeclaredWorkspaceMounts(
    workspaceConfig,
    expandWorkspaceMounts(workspaceConfig)
  );
  const mountSpecs = buildEngentyMountSpecs(declaredMounts, {
    agentId: input.agentId,
    runId: input.runId,
    sandboxLifecycle: workspaceConfig.sandbox?.lifecycle ?? "run",
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
    userId: input.scope.userId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.routineId ? { routineId: input.routineId } : {}),
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    ...(input.taskIdentifier ? { taskIdentifier: input.taskIdentifier } : {}),
  });
  if (mountSpecs.length === 0) {
    // Same call the chat lane makes, and worth the same line: the run proceeds,
    // but the agent's instructions may assume file tools that are not there.
    logger.info("workspace_skipped_no_resolved_mounts", {
      agent_id: input.agentId,
      declared_mount_paths: declaredMounts.map((mount) => mount.path),
      run_id: input.runId,
      tenant_id: input.scope.tenantId,
    });
    return;
  }

  return await buildAgentWorkspaceForRun({
    agentId: input.agentId,
    mounts: mountSpecs,
    runId: input.runId,
    scope: input.scope,
    threadId: input.threadId,
    workspaceConfig,
    ...(declared?.skillIds?.length
      ? { preferredSkillNames: declared.skillIds }
      : {}),
    ...(input.spaceResolution
      ? { spaceResolution: input.spaceResolution }
      : {}),
    ...(input.taskIdentifier ? { taskIdentifier: input.taskIdentifier } : {}),
  });
}
