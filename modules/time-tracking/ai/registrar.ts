import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  buildDeleteTimeEntryTool,
  TIME_TRACKING_DELETE_ENTRY_TOOL_ID,
} from "./tools/delete-time-entry.js";
import {
  buildLoadTimeEntriesTool,
  TIME_TRACKING_LOAD_ENTRIES_TOOL_ID,
} from "./tools/load-time-entries.js";
import {
  buildLogTimeEntryTool,
  TIME_TRACKING_LOG_ENTRY_TOOL_ID,
} from "./tools/log-time-entry.js";
import {
  buildUpdateTimeEntryTool,
  TIME_TRACKING_UPDATE_ENTRY_TOOL_ID,
} from "./tools/update-time-entry.js";

interface TimeTrackingAiOptions {
  invokeTimeTrackingOperation: PluginServerGatewayCaller["invokeOperation"];
}

function defineTimeTrackingAi(options: TimeTrackingAiOptions) {
  return defineModuleAi({
    agentDefinitions: () => [],
    dir: import.meta.url,
    moduleId: "time-tracking",
    tools: {
      [TIME_TRACKING_LOAD_ENTRIES_TOOL_ID]: buildLoadTimeEntriesTool(
        options.invokeTimeTrackingOperation
      ),
      [TIME_TRACKING_LOG_ENTRY_TOOL_ID]: buildLogTimeEntryTool(
        options.invokeTimeTrackingOperation
      ),
      [TIME_TRACKING_UPDATE_ENTRY_TOOL_ID]: buildUpdateTimeEntryTool(
        options.invokeTimeTrackingOperation
      ),
      [TIME_TRACKING_DELETE_ENTRY_TOOL_ID]: buildDeleteTimeEntryTool(
        options.invokeTimeTrackingOperation
      ),
    },
  });
}

export function timeTrackingAiRegistration(
  options: TimeTrackingAiOptions
): AiRegistration {
  return defineTimeTrackingAi(options).aiRegistration();
}

export function timeTrackingDynamicAiCapability(
  options: TimeTrackingAiOptions
): DynamicAiModuleCapability {
  return defineTimeTrackingAi(options).dynamicCapability();
}
