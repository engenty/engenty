import { describe, expect, it } from "vitest";
import type { AgentRunRow } from "../../dal/threads/types.js";
import {
  attachRunNeighbors,
  mapAgentRunToPlatformRecord,
  parentLinkFromMetadata,
  rollupPlatformRuns,
  runCostUsd,
} from "../run-api-mapper.js";

function run(over: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    agent_id: "engenty.copilot",
    cancelled_at: null,
    completion_tokens: 178,
    context_prompt_tokens: null,
    created_by_user_id: null,
    error_code: null,
    error_message: null,
    finished_at: "2026-08-27T12:00:04.000Z",
    id: "00000000-0000-4000-8000-000000000010",
    mastra_trace_id: null,
    metadata: {},
    model_id: "openai/gpt-4.1-mini",
    prompt_tokens: 1000,
    started_at: "2026-08-27T12:00:00.000Z",
    status: "completed",
    tenant_id: "00000000-0000-4000-8000-000000000001",
    thread_id: "00000000-0000-4000-8000-000000000003",
    trigger: "message",
    ...over,
  };
}

describe("runCostUsd", () => {
  it("converts catalog micros/MTok × tokens into USD", () => {
    // $2.50 / MTok in × 1M tokens = $2.50
    expect(
      runCostUsd({
        completionTokens: 0,
        inputPerMtokMicros: 2_500_000,
        outputPerMtokMicros: 10_000_000,
        promptTokens: 1_000_000,
      })
    ).toBe(2.5);
  });

  it("returns null when no catalog rates exist", () => {
    expect(
      runCostUsd({
        completionTokens: 10,
        inputPerMtokMicros: null,
        outputPerMtokMicros: null,
        promptTokens: 20,
      })
    ).toBeNull();
  });
});

describe("mapAgentRunToPlatformRecord", () => {
  it("joins thread title, catalog name, and estimated cost", () => {
    const mapped = mapAgentRunToPlatformRecord(run(), {
      model: {
        displayName: "GPT-4.1 mini",
        inputPerMtokMicros: 400_000,
        outputPerMtokMicros: 1_600_000,
      },
      threadTitle: "Q3 close",
    });
    expect(mapped.model_id).toBe("openai/gpt-4.1-mini");
    expect(mapped.model_display_name).toBe("GPT-4.1 mini");
    expect(mapped.thread_title).toBe("Q3 close");
    expect(mapped.cost_usd).toBeCloseTo(
      (400_000 * 1000 + 1_600_000 * 178) / 1e12
    );
  });

  it("reads parent stamps from metadata", () => {
    expect(
      parentLinkFromMetadata({
        parent_run_id: "run-parent",
        parent_thread_id: "thread-parent",
        parent_tool_call_id: "tool-1",
      })
    ).toEqual({
      parent_run_id: "run-parent",
      parent_thread_id: "thread-parent",
      parent_tool_call_id: "tool-1",
    });
    expect(parentLinkFromMetadata({})).toEqual({
      parent_run_id: null,
      parent_thread_id: null,
      parent_tool_call_id: null,
    });
  });
});

describe("attachRunNeighbors", () => {
  it("wires prev/next and 1-based index", () => {
    const a = mapAgentRunToPlatformRecord(run());
    const b = mapAgentRunToPlatformRecord(
      run({ id: "00000000-0000-4000-8000-000000000011" })
    );
    const [first, second] = attachRunNeighbors([a, b]);
    expect(first).toMatchObject({
      next_run_id: b.id,
      prev_run_id: null,
      thread_run_count: 2,
      thread_run_index: 1,
    });
    expect(second).toMatchObject({
      next_run_id: null,
      prev_run_id: a.id,
      thread_run_index: 2,
    });
  });
});

describe("rollupPlatformRuns", () => {
  it("sums tokens, cost, wall duration, and turn count", () => {
    const first = mapAgentRunToPlatformRecord(run(), {
      model: {
        displayName: "GPT-4.1 mini",
        inputPerMtokMicros: 400_000,
        outputPerMtokMicros: 1_600_000,
      },
    });
    const second = mapAgentRunToPlatformRecord(
      run({
        finished_at: "2026-08-27T12:00:10.000Z",
        id: "00000000-0000-4000-8000-000000000011",
        started_at: "2026-08-27T12:00:05.000Z",
      }),
      {
        model: {
          displayName: "GPT-4.1 mini",
          inputPerMtokMicros: 400_000,
          outputPerMtokMicros: 1_600_000,
        },
      }
    );
    const rollup = rollupPlatformRuns([first, second]);
    expect(rollup.turns).toBe(2);
    expect(rollup.tokens_in).toBe(2000);
    expect(rollup.tokens_out).toBe(356);
    expect(rollup.duration_ms).toBe(10_000);
    expect(rollup.cost_usd).toBeCloseTo(
      (first.cost_usd ?? 0) + (second.cost_usd ?? 0)
    );
  });
});
