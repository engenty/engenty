// The no-op agent every scheduler schedule is attached to.
//
// The Mastra schedule worker requires a REGISTERED agent — a missing agent
// makes the worker delete the schedule (self-clean). Engenty schedules never
// run an agent (the `prepare` hook does the work and returns null), so this
// agent exists purely to satisfy that requirement. If it ever produces output,
// something bypassed the prepare hook — the instructions say so.
import { Agent } from "@mastra/core/agent";
import { SCHEDULER_AGENT_ID } from "./heartbeat-sync.js";

export function createSchedulerAgent(): Agent {
  return new Agent({
    id: SCHEDULER_AGENT_ID,
    name: "Engenty Scheduler",
    description:
      "Internal no-op anchor for Engenty scheduler schedules. Never runs.",
    instructions:
      "You are a placeholder. Reply with exactly: 'scheduler misconfiguration — this agent must never run'.",
    model: "openai/gpt-5-mini",
  });
}
