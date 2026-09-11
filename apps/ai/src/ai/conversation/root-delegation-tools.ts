import { withCatalogFloor } from "../../../ai/tools/agent-hire-policy.js";
import { MESSAGE_AGENT_TOOL_ID } from "../../../ai/tools/message-agent-tool.js";
import type { AgentConfig, MastraToolDefinition } from "../registry/index.js";
import type { RunSpaceResolution } from "../sessions/run-space.js";
import {
  createDelegationTools,
  type DelegationToolDeps,
} from "./delegate-tool.js";
import { createMessageAgentTool } from "./message-agent-tool.js";

export interface RootDelegationToolsInput extends DelegationToolDeps {
  rootAgentId: string;
  rootConfig?: AgentConfig;
  spaceResolution: RunSpaceResolution;
}

export interface RootDelegationTools {
  extraTools: Record<string, MastraToolDefinition>;
  skipNativeSubAgents: boolean;
}

/**
 * Build every root-only child-run tool from one resolved Space decision.
 *
 * Fresh starts and post-restart snapshot resumes must call this same helper.
 * Leaf runs never do: they retain the registry stub and cannot nest children.
 */
export function createRootDelegationTools(
  input: RootDelegationToolsInput
): RootDelegationTools {
  const declaredSubAgents = input.rootConfig?.subAgents ?? [];
  const resolution = input.spaceResolution;
  const mountedSubAgents =
    resolution.kind === "unresolved"
      ? []
      : resolution.kind === "resolved"
        ? declaredSubAgents.filter((subAgent) =>
            resolution.space.agentIds.has(subAgent.id)
          )
        : declaredSubAgents;

  // One run, one dedupe map, shared by both delegation verbs.
  const deps: DelegationToolDeps = {
    ...input,
    completedDelegations: new Map(),
  };
  const extraTools: Record<string, MastraToolDefinition> = {
    ...createDelegationTools(mountedSubAgents, deps),
  };

  // Read the tools the agent will actually hold: a hired specialist keeps the
  // catalog floor (which carries `message_agent`) whatever its row says, and
  // checking the raw row left every blank hire with the leaf stub — it told
  // the person it "cannot message other agents" on its own desk.
  const rootToolIds =
    input.rootConfig?.source === "database"
      ? withCatalogFloor(input.rootConfig.toolIds)
      : (input.rootConfig?.toolIds ?? []);
  if (rootToolIds.includes(MESSAGE_AGENT_TOOL_ID)) {
    extraTools[MESSAGE_AGENT_TOOL_ID] = createMessageAgentTool({
      ...deps,
      mountedAgentIds:
        resolution.kind === "resolved"
          ? resolution.space.agentIds
          : new Set<string>(),
      parentAgentId: input.rootAgentId,
    });
  }

  return {
    extraTools,
    // Once child-run delegation is available, never let filtering an empty or
    // unresolved Space re-enable Mastra's in-process sub-agent back door.
    skipNativeSubAgents: declaredSubAgents.length > 0,
  };
}
