import type { AGUIEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  buildRunLlmCalls,
  readRunFinishedUsage,
  runTraceStats,
} from "../run-trace.js";
import { buildInspectorTrajectory } from "../trajectory.js";

function events(list: Record<string, unknown>[]): AGUIEvent[] {
  return list as unknown as AGUIEvent[];
}

const STREAM = events([
  { role: "user", type: "TEXT_MESSAGE_START" },
  { delta: "Fix ports.py", type: "TEXT_MESSAGE_CONTENT" },
  { type: "TEXT_MESSAGE_END" },
  {
    name: "engenty.debug.initial_prompt",
    type: "CUSTOM",
    value: {
      runtimeContextInstructions: "",
      systemInstructions: "You are a coding agent.",
      toolNames: ["read"],
    },
  },
  { messageId: "r1", type: "REASONING_MESSAGE_START" },
  {
    delta: "I'll inspect ports.py first.",
    messageId: "r1",
    type: "REASONING_MESSAGE_CONTENT",
  },
  { messageId: "r1", type: "REASONING_MESSAGE_END" },
  {
    toolCallId: "c1",
    toolCallName: "read",
    type: "TOOL_CALL_START",
  },
  { toolCallId: "c1", type: "TOOL_CALL_END" },
  { role: "assistant", type: "TEXT_MESSAGE_START" },
  { delta: "The range is off by one.", type: "TEXT_MESSAGE_CONTENT" },
  { type: "TEXT_MESSAGE_END" },
  {
    type: "RUN_FINISHED",
    usage: [
      { inputTokens: 100, outputTokens: 12 },
      { inputTokens: 250, outputTokens: 40 },
    ],
  },
]);

describe("run trace", () => {
  it("reads per-call usage off RUN_FINISHED", () => {
    expect(readRunFinishedUsage(STREAM)).toEqual([
      {
        cachedTokens: null,
        inputTokens: 100,
        outputTokens: 12,
        reasoningTokens: null,
      },
      {
        cachedTokens: null,
        inputTokens: 250,
        outputTokens: 40,
        reasoningTokens: null,
      },
    ]);
  });

  it("groups assistant generations with the tools they issued", () => {
    const rows = buildInspectorTrajectory(STREAM);
    expect(runTraceStats(rows)).toEqual({
      llmCalls: 2,
      toolCalls: 1,
      turns: 1,
    });
    const calls = buildRunLlmCalls(rows, readRunFinishedUsage(STREAM));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      index: 1,
      inputTokens: 100,
      outputTokens: 12,
      text: "I'll inspect ports.py first.",
      toolNames: ["read"],
    });
    expect(calls[1]).toMatchObject({
      index: 2,
      inputTokens: 250,
      outputTokens: 40,
      text: "The range is off by one.",
    });
  });
});
