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
  TASK_JOB_WORKFLOW_ID,
  taskJobWorkflow,
} from "./workflows/task-job-workflow.js";

// Durable storage persists suspended-run snapshots so HITL tool approvals
// resume natively (see mastra-storage.ts). Attached only when a Postgres
// connection is configured. The same storage's `schedules` domain backs the
// trigger scheduler's heartbeats.
const engentyMastraStorage = createEngentyMastraStorage();

// Mastra Studio dev shell — registers a static supervisor agent without
// subAgents/backgroundTasks. Production copilot runs use createBuiltinProvider
// + assembleDynamicAgent in the session harness (see copilot-agent.ts).
// The scheduler agent is a no-op anchor for trigger heartbeats (see
// src/scheduler/) — the heartbeat hooks do the work; it never runs.
export const mastra = new Mastra({
  agents: {
    [ENGENTY_COPILOT_AGENT_ID]: engentyCopilotAgent,
    [SCHEDULER_AGENT_ID]: createSchedulerAgent(),
  },
  heartbeat: createSchedulerHeartbeatHooks(),
  workflows: {
    [ACTION_JOB_WORKFLOW_ID]: actionJobWorkflow,
    [TASK_JOB_WORKFLOW_ID]: taskJobWorkflow,
  },
  ...(engentyMastraStorage ? { storage: engentyMastraStorage } : {}),
});
