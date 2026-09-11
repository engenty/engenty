import { Mastra } from "@mastra/core/mastra";
import { MastraEditor } from "@mastra/editor";
import { createEngentyMastraStorage } from "../src/ai/mastra-storage.js";
import {
  TASK_JOB_TOOL_NAME,
  taskJobRecoveryTool,
} from "../src/api/task-background-dispatch.js";
import { createSchedulerHeartbeatHooks } from "../src/scheduler/heartbeat-hooks.js";
import { SCHEDULER_AGENT_ID } from "../src/scheduler/heartbeat-sync.js";
import { createSchedulerAgent } from "../src/scheduler/scheduler-agent.js";
import {
  ENGENTY_COPILOT_AGENT_ID,
  engentyCopilotAgent,
} from "./agents/engenty.copilot/copilot-agent.js";
import { createEngentyObservability } from "./observability.js";
import {
  APP_BUILD_WORKFLOW_ID,
  appBuildWorkflow,
} from "./workflows/app-build-workflow.js";

// Durable storage persists suspended-run snapshots so HITL tool approvals
// resume natively (see mastra-storage.ts). Attached only when a Postgres
// connection is configured. The same storage's `schedules` domain backs the
// trigger scheduler.
const engentyMastraStorage = createEngentyMastraStorage();

// Agent-run tracing to the configured sinks (see observability.ts). Reads the
// sink keys NOW, at module evaluation — index.ts hydrates platform settings
// before importing app.js for exactly this reason.
const engentyObservability = createEngentyObservability();

// Mastra Studio dev shell — registers a static supervisor agent without
// subAgents/backgroundTasks. Production copilot runs use createBuiltinProvider
// + assembleDynamicAgent in the session harness (see copilot-agent.ts).
// The scheduler agent is a no-op anchor for trigger schedules (see
// src/scheduler/) — the schedule hooks do the work; it never runs.
// Background tasks are the execution substrate for dispatched work (Phase 8):
// persistence, per-agent concurrency, backpressure and stale-task recovery,
// which we previously hand-built as pgmq + a consumer + a boot resume. Enabled
// unconditionally so the manager EXISTS; which substrate a dispatch actually
// takes is decided per call (`ENGENTY_TASK_DISPATCH_SUBSTRATE`) while the
// workflow remains the default.
export const mastra = new Mastra({
  agents: {
    [ENGENTY_COPILOT_AGENT_ID]: engentyCopilotAgent,
    [SCHEDULER_AGENT_ID]: createSchedulerAgent(),
  },
  backgroundTasks: {
    enabled: true,
    // A dispatched task is a whole unit of work, not a tool call inside a
    // turn: minutes, not seconds. The old queue had no timeout at all, so
    // anything short of generous would be a new failure mode, not a fix.
    defaultTimeoutMs: 30 * 60 * 1000,
    // Matches the dispatch consumer's effective behaviour (one run at a time
    // per agent, several agents in parallel) rather than inventing new limits
    // during a substrate swap.
    perAgentConcurrency: 1,
  },
  schedules: createSchedulerHeartbeatHooks(),
  // The task-job executor recovery is guaranteed to find: Mastra 1.59 runs
  // `recoverStaleTasks` from the CONSTRUCTOR (before any boot code), and config
  // tools are the one registration it performs ahead of that. See the tool's
  // doc comment for the tier-2 caveat; `registerTaskJobExecutor` (app.ts)
  // overwrites this with the suspend-capable executor for steady-state work.
  tools: {
    [TASK_JOB_TOOL_NAME]: taskJobRecoveryTool,
  },
  workflows: {
    [APP_BUILD_WORKFLOW_ID]: appBuildWorkflow,
  },
  // Studio Editor overlays (instructions / tool descriptions) live in the
  // same PostgresStore. Code still owns the agent defaults — we do not set
  // `editor: { instructions: true }` on Agent, which would forbid instructions
  // in code. Production copilot runs assemble via createBuiltinProvider, so
  // published Studio drafts do not change live chats. Needs storage: without
  // it there is nowhere to persist drafts.
  ...(engentyMastraStorage
    ? { editor: new MastraEditor(), storage: engentyMastraStorage }
    : {}),
  ...(engentyObservability ? { observability: engentyObservability } : {}),
});
