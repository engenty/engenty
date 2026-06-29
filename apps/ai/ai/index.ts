import { Mastra } from "@mastra/core/mastra";
import { createEngentyMastraStorage } from "../src/ai/mastra-storage.js";
import {
  ENGENTY_COPILOT_AGENT_ID,
  engentyCopilotAgent,
} from "./agents/engenty.copilot/copilot-agent.js";
import {
  ACTION_JOB_WORKFLOW_ID,
  actionJobWorkflow,
} from "./workflows/action-job-workflow.js";
import {
  TASK_JOB_WORKFLOW_ID,
  taskJobWorkflow,
} from "./workflows/task-job-workflow.js";

// Durable storage persists suspended-run snapshots so HITL tool approvals
// resume natively (see mastra-storage.ts). Attached only when a Postgres
// connection is configured.
const engentyMastraStorage = createEngentyMastraStorage();

// Mastra Studio dev shell — registers a static supervisor agent without
// subAgents/backgroundTasks. Production copilot runs use createBuiltinProvider
// + assembleDynamicAgent in the session harness (see copilot-agent.ts).
export const mastra = new Mastra({
  agents: { [ENGENTY_COPILOT_AGENT_ID]: engentyCopilotAgent },
  workflows: {
    [ACTION_JOB_WORKFLOW_ID]: actionJobWorkflow,
    [TASK_JOB_WORKFLOW_ID]: taskJobWorkflow,
  },
  ...(engentyMastraStorage ? { storage: engentyMastraStorage } : {}),
});
