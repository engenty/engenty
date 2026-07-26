import { Mastra } from "@mastra/core/mastra";
import { createEngentyMastraStorage } from "../src/ai/mastra-storage.js";
import { createSchedulerHeartbeatHooks } from "../src/scheduler/heartbeat-hooks.js";
import { SCHEDULER_AGENT_ID } from "../src/scheduler/heartbeat-sync.js";
import { createSchedulerAgent } from "../src/scheduler/scheduler-agent.js";
import {
  ENGENTY_COPILOT_AGENT_ID,
  engentyCopilotAgent,
} from "./agents/engenty.copilot/copilot-agent.js";
import {
  ACTION_JOB_WORKFLOW_ID,
  actionJobWorkflow,
} from "./workflows/action-job-workflow.js";
import {
  APP_BUILD_WORKFLOW_ID,
  appBuildWorkflow,
} from "./workflows/app-build-workflow.js";
import {
  TASK_JOB_WORKFLOW_ID,
  taskJobWorkflow,
} from "./workflows/task-job-workflow.js";

// Durable storage persists suspended-run snapshots so HITL tool approvals
// resume natively (see mastra-storage.ts). Attached only when a Postgres
// connection is configured. The same storage's `schedules` domain backs the
// trigger scheduler.
const engentyMastraStorage = createEngentyMastraStorage();

// Mastra Studio dev shell — registers a static supervisor agent without
// subAgents/backgroundTasks. Production copilot runs use createBuiltinProvider
// + assembleDynamicAgent in the session harness (see copilot-agent.ts).
// The scheduler agent is a no-op anchor for trigger schedules (see
// src/scheduler/) — the schedule hooks do the work; it never runs.
export const mastra = new Mastra({
  agents: {
    [ENGENTY_COPILOT_AGENT_ID]: engentyCopilotAgent,
    [SCHEDULER_AGENT_ID]: createSchedulerAgent(),
  },
  schedules: createSchedulerHeartbeatHooks(),
  workflows: {
    [ACTION_JOB_WORKFLOW_ID]: actionJobWorkflow,
    [APP_BUILD_WORKFLOW_ID]: appBuildWorkflow,
    [TASK_JOB_WORKFLOW_ID]: taskJobWorkflow,
  },
  ...(engentyMastraStorage ? { storage: engentyMastraStorage } : {}),
});
