import {
  buildProposeUpdatesTool,
  buildRequestFeedbackTool,
  buildSetStateTool,
} from "@engenty/ai-core";
import {
  createEngentyCopilotAgentTools as createCopilotAgentTools,
  createEngentyCopilotAgent,
} from "@engenty/engenty-copilot/ai";
import { createTool } from "@mastra/core/tools";
import { createAgentLookTools } from "../../tools/agent-look-tool.js";
import { createAgentProposeTools } from "../../tools/agent-propose-tool.js";
import { createAgentRemoveTools } from "../../tools/agent-remove-tool.js";
import { createAgentSelfReviseTools } from "../../tools/agent-self-revise-tool.js";
import { createAgentStatusTools } from "../../tools/agent-status-tool.js";
import { createAnalyzeFileTool } from "../../tools/analyze-file/index.js";
import { createAppBuildTools } from "../../tools/app-build-tool.js";
import { createArtifactTools } from "../../tools/artifact-tools.js";
import { createChatThreadSearchTool } from "../../tools/chat-thread-search/index.js";
import { createCleanupCsvTool } from "../../tools/cleanup-csv/index.js";
import { createConnectorImportRequestTools } from "../../tools/connector-import-request-tool.js";
import { createConvertImageTool } from "../../tools/convert-image/index.js";
import { createDeskPostTools } from "../../tools/desk-post-tool.js";
import { createEngentyCatalogTools } from "../../tools/engenty-tools/create-engenty-tools.js";
import { getEngentyToolsRunContext } from "../../tools/engenty-tools/lib/run-context.js";
import { createInvokeActionTools } from "../../tools/invoke-workflow-tool.js";
import { createMessageAgentStubTools } from "../../tools/message-agent-tool.js";
import { registryAgentsListTool } from "../../tools/registry-agents-list-tool.js";
import { createNativeRequestDecisionTool } from "../../tools/request-decision/native-request-decision.js";
import { createRoutineTools } from "../../tools/routines-tools.js";
import { createShowObjectsTool } from "../../tools/show-objects-tool.js";
import { createShowUiTool } from "../../tools/show-ui-tool.js";
import { createShowWidgetTool } from "../../tools/show-widget-tool.js";
import { createSkillProposeTools } from "../../tools/skill-propose-tool.js";
import { createSkillsFindTools } from "../../tools/skills-find-tool.js";
import { createSpaceSetupTools } from "../../tools/space-setup-tool.js";
import { createTableTools } from "../../tools/table-tools.js";
import { createThreadStateTools } from "../../tools/thread-state-tools.js";
import { createVaultFileTools } from "../../tools/vault-files/index.js";
import { createWebSearchTool } from "../../tools/web-search/index.js";
import { createActionProposeTools } from "../../tools/workflow-propose-tool.js";
import { createWorkflowSelfReviseTools } from "../../tools/workflow-self-revise-tool.js";
import { createActionsListTools } from "../../tools/workflows-list-tool.js";

const analyzeFileTool = createAnalyzeFileTool();
const chatThreadSearchTool = createChatThreadSearchTool();
const cleanupCsvTool = createCleanupCsvTool();
const convertImageTool = createConvertImageTool();
const webSearchTool = createWebSearchTool();

export const proposeUpdatesTool = buildProposeUpdatesTool(createTool);
// Native Mastra suspend (parks the run, resumes with the user's choice as this
// tool's result) instead of the artifact+abort path — see
// native-request-decision.ts. It degrades to the artifact for runs with no human
// channel, so headless jobs behave exactly as before.
export const requestDecisionTool = createNativeRequestDecisionTool();
// Same runtime-capability split as requestDecision: a run that cannot park for
// a human answer must not be told one was asked (see native-request-decision.ts).
export const requestFeedbackTool = buildRequestFeedbackTool(createTool, {
  hasHumanChannel: () =>
    getEngentyToolsRunContext().canSuspendForInteraction === true,
});
export const setStateTool = buildSetStateTool(createTool);

// Catalog runner + vault tools live directly on the copilot (and other agents
// via toolIds) — there is no engenty-tools sub-agent anymore.
export function createEngentyCopilotAgentTools() {
  return {
    ...createCopilotAgentTools({
      chatThreadSearch: chatThreadSearchTool,
      requestDecision: requestDecisionTool,
      requestFeedback: requestFeedbackTool,
      webSearch: webSearchTool,
    }),
    set_state: setStateTool,
    ...createEngentyCatalogTools(),
    ...createSkillProposeTools(),
    ...createSkillsFindTools(),
    ...createConnectorImportRequestTools(),
    ...createSpaceSetupTools(),
    ...createVaultFileTools(),
    ...createArtifactTools(),
    ...createTableTools(),
    ...createMessageAgentStubTools(),
    // Read-only look at a colleague's desk — the pull half of agents talking.
    ...createAgentStatusTools(),
    cleanup_csv: cleanupCsvTool,
    registry_agents_list: registryAgentsListTool,
    show_objects: createShowObjectsTool(),
    show_ui: createShowUiTool(),
    show_widget: createShowWidgetTool(),
  };
}

/** All builtin runtime tools resolved by CompositeAiRegistry.getTool. */
export function createBuiltinRegistryTools() {
  return {
    ...createEngentyCopilotAgentTools(),
    // Registered for resolution only — agents get it via their toolIds. Both
    // the coordinator and the copilot declare it: hiring is how "run this every
    // morning" acquires an owner that isn't a live chat surface.
    ...createAgentProposeTools(),
    // Its counterpart: whoever may hire into the Space may also delete a
    // hired specialist there (or take a module agent out of the Space) —
    // always behind a card a person approves.
    ...createAgentRemoveTools(),
    // Multi-step action writer. Registered for resolution only, same as
    // agent_propose — an agent gets it by declaring it in toolIds.
    //
    // NOW DECLARED (copilot + coordinator), reversing the earlier hold-back.
    // The old objection was that writing a flow mid-conversation puts the
    // model on the authoring side of the publish gate. It doesn't: this tool
    // saves an UNAPPROVED version and publishing stays a human-only route,
    // which is the same shape as agent_propose — already declared by both
    // agents on exactly that reasoning. The review moved to where the rest of
    // flow authoring already lives: the canvas, which now opens inside the
    // Space and takes changes as prose (there is no manual node editor), so a
    // proposed flow lands in the one place a human already reviews flows.
    ...createActionProposeTools(),
    // The catalog read that makes the other two usable: a name -> id lookup
    // for invoke_workflow, and a "does this already exist?" check before
    // proposing a duplicate.
    ...createActionsListTools(),
    // Lets an open-ended run call a governed deterministic flow as one step
    // instead of improvising it — the bridge between tasks and actions.
    ...createInvokeActionTools(),
    // Recurring work: a hire FOR a schedule is only finished once its routine
    // exists, so the agent that can hire must also be able to give the job.
    // (A specialist is complete without a routine — chat-only hires are fine.)
    ...createRoutineTools(),
    // App-build composite. Declared by engenty.app-coder AND the copilot: the
    // copilot was originally delegation-only, but live runs showed the
    // routing-tier supervisor scaffolding fake "apps" in its workspace rather
    // than delegating — so the correct one-call path is in its own hands now
    // (see ENGENTY_COPILOT_TOOL_IDS in modules/engenty-copilot).
    ...createAppBuildTools(),
    // Self-scoped registry write: a specialist proposing a change to its own
    // standing instructions. Registered for resolution only — the copilot
    // already has agent_propose, which covers its own row and everyone
    // else's.
    ...createAgentSelfReviseTools(),
    // Own face: blob catalog, generated portrait, name + mandate — proposed
    // for approval. Resolution only; specialists keep it via the catalog floor.
    ...createAgentLookTools(),
    // Its sibling for the Workflows a specialist owns: one existing Workflow,
    // a new unapproved version, never a new Workflow and never someone
    // else's. Resolution only — the copilot's workflow_propose already
    // covers every Workflow.
    ...createWorkflowSelfReviseTools(),
    // Durable per-thread state, for agents that run something across turns.
    // Registered for resolution only: the copilot answers one request at a
    // time and would carry the schema on every call for nothing. A specialist
    // running an exercise declares it (and keeps it via the catalog floor).
    ...createThreadStateTools(),
    // A specialist speaking on its own desk unprompted. Resolution only: the
    // copilot is always answering someone; a specialist keeps it via the
    // catalog floor.
    ...createDeskPostTools(),
    // File analyst (and any agent listing analyze_file in toolIds).
    analyze_file: analyzeFileTool,
    convert_image: convertImageTool,
    proposeUpdates: proposeUpdatesTool,
  };
}

// Mastra Studio dev shell only — no subAgents/backgroundTasks. Production
// sessions assemble engenty.copilot via createBuiltinProvider + harness.
export const engentyCopilotAgent = createEngentyCopilotAgent({
  tools: createEngentyCopilotAgentTools(),
});

export {
  ENGENTY_CATALOG_TOOL_IDS,
  ENGENTY_CLI_AGENT_ID,
  ENGENTY_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_TOOL_IDS,
  ENGENTY_INSTRUCTIONS,
  ENGENTY_VAULT_TOOL_IDS,
  engentyCopilotAgentConfig,
} from "@engenty/engenty-copilot/ai";
