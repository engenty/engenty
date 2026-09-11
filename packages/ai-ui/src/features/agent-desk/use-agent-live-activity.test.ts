import { describe, expect, it } from "vitest";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { agentLiveActivityByAgent } from "./use-agent-live-activity.js";

function run(overrides: Partial<AiAgentRunSummary>): AiAgentRunSummary {
  return {
    agent_id: "manager",
    created_at: "2026-09-09T12:00:00.000Z",
    error: null,
    finished_at: null,
    id: "r1",
    request_id: null,
    started_at: "2026-09-09T12:00:00.000Z",
    status: "running",
    summary: null,
    tenant_id: "t1",
    thread_id: "th1",
    trigger: "message",
    workflow_id: null,
    ...overrides,
  };
}

describe("agentLiveActivityByAgent", () => {
  it("reads an ask that is still the newest thing in its conversation", () => {
    expect(
      agentLiveActivityByAgent([run({ status: "requires_action" })]).get(
        "manager"
      )
    ).toBe("needs_input");
  });

  it("drops an ask the conversation has since moved past", () => {
    // `requires_action` is how a suspended run ENDS and is never cleared, so
    // without this the row said "waiting for you" about yesterday for good.
    const runs = [
      run({
        id: "new",
        started_at: "2026-09-10T07:09:00.000Z",
        status: "succeeded",
      }),
      run({
        id: "old",
        started_at: "2026-09-09T12:38:00.000Z",
        status: "requires_action",
      }),
    ];
    expect(agentLiveActivityByAgent(runs).get("manager")).toBeUndefined();
  });

  it("does not care what order the feed arrives in", () => {
    const runs = [
      run({
        id: "old",
        started_at: "2026-09-09T12:38:00.000Z",
        status: "requires_action",
      }),
      run({
        id: "new",
        started_at: "2026-09-10T07:09:00.000Z",
        status: "succeeded",
      }),
    ];
    expect(agentLiveActivityByAgent(runs).get("manager")).toBeUndefined();
  });

  it("keeps an ask in ANOTHER conversation while this one works", () => {
    // Parallel jobs are the point of a desk: a finished thread must not speak
    // for a thread that is genuinely parked on a person.
    const runs = [
      run({ id: "a", status: "requires_action", thread_id: "th1" }),
      run({ id: "b", status: "running", thread_id: "th2" }),
    ];
    expect(agentLiveActivityByAgent(runs).get("manager")).toBe("needs_input");
  });

  it("says working when that is all there is", () => {
    expect(
      agentLiveActivityByAgent([run({ status: "queued" })]).get("manager")
    ).toBe("working");
  });

  it("ignores runs with no agent", () => {
    expect(agentLiveActivityByAgent([run({ agent_id: "" })]).size).toBe(0);
  });
});
