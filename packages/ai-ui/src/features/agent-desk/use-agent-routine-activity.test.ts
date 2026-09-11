import { describe, expect, it } from "vitest";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import {
  pickUnattendedRunInFlight,
  readRoutineId,
} from "./use-agent-routine-activity.js";

function run(patch: Partial<AiAgentRunSummary>): AiAgentRunSummary {
  return {
    workflow_id: null,
    agent_id: "finance.stock-quotes",
    created_at: "2026-08-25T20:58:26.000Z",
    error: null,
    finished_at: null,
    id: "run-1",
    request_id: null,
    started_at: "2026-08-25T20:58:26.000Z",
    status: "running",
    summary: null,
    tenant_id: "t",
    thread_id: "thread-1",
    trigger: "cron",
    ...patch,
  } as AiAgentRunSummary;
}

describe("pickUnattendedRunInFlight", () => {
  it("takes the newest in-flight run nobody typed", () => {
    // `listAgentRuns` answers newest first.
    const picked = pickUnattendedRunInFlight([
      run({ id: "newest", trigger: "direct" }),
      run({ id: "older", trigger: "cron" }),
    ]);
    expect(picked?.id).toBe("newest");
  });

  it("ignores a person's own chat turn", () => {
    // The lane already streams it — reporting it back as unattended work would
    // narrate the user's own message to them.
    expect(pickUnattendedRunInFlight([run({ trigger: "message" })])).toBeNull();
  });

  it("ignores a run that has already ended", () => {
    expect(
      pickUnattendedRunInFlight([run({ status: "succeeded" })])
    ).toBeNull();
  });

  it("finds a queued fire before it starts executing", () => {
    expect(pickUnattendedRunInFlight([run({ status: "queued" })])?.id).toBe(
      "run-1"
    );
  });

  it("skips a live chat turn to reach the fire behind it", () => {
    const picked = pickUnattendedRunInFlight([
      run({ id: "chat", trigger: "message" }),
      run({ id: "fire", trigger: "cron" }),
    ]);
    expect(picked?.id).toBe("fire");
  });
});

describe("readRoutineId", () => {
  it("reads the routine off a run thread", () => {
    expect(readRoutineId({ routine_id: "01a03ab6" })).toBe("01a03ab6");
  });

  it("is null for a thread that carries no routine", () => {
    // A press or a delegated job — real unattended work, but the room it was
    // started from already reports it.
    expect(readRoutineId({ task_id: "t-1" })).toBeNull();
    expect(readRoutineId(null)).toBeNull();
    expect(readRoutineId({ routine_id: "  " })).toBeNull();
  });
});
