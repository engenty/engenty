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
import { createAgentProposeTools } from "../../tools/agent-propose-tool.js";
import { createAnalyzeFileTool } from "../../tools/analyze-file/index.js";
import { createAppBuildTools } from "../../tools/app-build-tool.js";
import { createArtifactTools } from "../../tools/artifact-tools.js";
import { createChatThreadSearchTool } from "../../tools/chat-thread-search/index.js";
import { createCleanupCsvTool } from "../../tools/cleanup-csv/index.js";
import { createConvertImageTool } from "../../tools/convert-image/index.js";
import { createEngentyCatalogTools } from "../../tools/engenty-tools/create-engenty-tools.js";
import { createMemoryTools } from "../../tools/memory-tools/index.js";
import { registryAgentsListTool } from "../../tools/registry-agents-list-tool.js";
import { createNativeRequestDecisionTool } from "../../tools/request-decision/native-request-decision.js";
import { createShowObjectsTool } from "../../tools/show-objects-tool.js";
import { createShowUiTool } from "../../tools/show-ui-tool.js";
import { createShowWidgetTool } from "../../tools/show-widget-tool.js";
import { createSkillProposeTools } from "../../tools/skill-propose-tool.js";
import { createVaultFileTools } from "../../tools/vault-files/index.js";
import { createWebSearchTool } from "../../tools/web-search/index.js";

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
export const requestFeedbackTool = buildRequestFeedbackTool(createTool);
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
    ...createMemoryTools(),
    ...createSkillProposeTools(),
    ...createVaultFileTools(),
    ...createArtifactTools(),
    cleanup_csv: cleanupCsvTool,
    show_objects: createShowObjectsTool(),
    show_ui: createShowUiTool(),
    show_widget: createShowWidgetTool(),
  };
}

/** All builtin runtime tools resolved by CompositeAiRegistry.getTool. */
export function createBuiltinRegistryTools() {
  return {
    ...createEngentyCopilotAgentTools(),
    // Registered for resolution only — agents get it solely via their
    // toolIds (the coordinator declares it; the copilot does not).
    ...createAgentProposeTools(),
    // App-build composite. Declared by engenty.app-coder AND the copilot: the
    // copilot was originally delegation-only, but live runs showed the
    // routing-tier supervisor scaffolding fake "apps" in its workspace rather
    // than delegating — so the correct one-call path is in its own hands now
    // (see ENGENTY_COPILOT_TOOL_IDS in modules/engenty-copilot).
    ...createAppBuildTools(),
    // File analyst (and any agent listing analyze_file in toolIds).
    analyze_file: analyzeFileTool,
    convert_image: convertImageTool,
    proposeUpdates: proposeUpdatesTool,
    registry_agents_list: registryAgentsListTool,
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
