import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  buildInspectorTrajectory,
  trajectoryTranscript,
} from "./ag-ui-inspector-trajectory.js";

const CALL = "call_read_1";

function events(list: Record<string, unknown>[]): AGUIEvent[] {
  return list as unknown as AGUIEvent[];
}

describe("buildInspectorTrajectory", () => {
  it("projects a run into SYSTEM / USER / CONTEXT / ASSISTANT / TOOL rows", () => {
    const rows = buildInspectorTrajectory(
      events([
        { role: "user", type: "TEXT_MESSAGE_START" },
        {
          delta: "Fix the off-by-one bug in ports.py",
          type: "TEXT_MESSAGE_CONTENT",
        },
        { type: "TEXT_MESSAGE_END" },
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            modelMessages: [
              { content: "You are a coding agent.", role: "system" },
            ],
            runtimeContextInstructions: "Read-only: ports.py",
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
          toolCallId: CALL,
          toolCallName: "read",
          type: "TOOL_CALL_START",
        },
        {
          delta: '{"file_path":"ports.py"}',
          toolCallId: CALL,
          type: "TOOL_CALL_ARGS",
        },
        { toolCallId: CALL, type: "TOOL_CALL_END" },
        {
          content: "def ports():\n  return range(80, 84)",
          toolCallId: CALL,
          type: "TOOL_CALL_RESULT",
        },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        {
          delta: "The off-by-one is in the range.",
          type: "TEXT_MESSAGE_CONTENT",
        },
        { type: "TEXT_MESSAGE_END" },
      ])
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "system",
      "user",
      "context",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(rows[0]?.text).toContain("You are a coding agent.");
    expect(rows[1]?.text).toContain("off-by-one");
    expect(rows[2]?.text).toContain("Current runtime context");
    expect(rows[3]?.text).toBe("I'll inspect ports.py first.");
    expect(rows[3]?.turnStart).toBe(true);
    expect(rows[3]?.turn).toBe(1);
    expect(rows[4]?.text).toBe('read {"file_path":"ports.py"}');
    expect(rows[4]?.result).toContain("def ports()");
    expect(rows[5]?.text).toContain("off-by-one is in the range");
  });

  it("projects systemInstructions (not only legacy modelMessages) as SYSTEM", () => {
    const rows = buildInspectorTrajectory(
      events([
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            runtimeContextInstructions: "Space: company",
            systemInstructions: "You are the copilot.",
            toolNames: ["navigate"],
          },
        },
        { role: "user", type: "TEXT_MESSAGE_START" },
        { delta: "hello", type: "TEXT_MESSAGE_CONTENT" },
        { type: "TEXT_MESSAGE_END" },
      ])
    );
    expect(rows.map((row) => row.kind)).toEqual(["system", "user", "context"]);
    expect(rows[0]?.detail).toContain("You are the copilot.");
    expect(rows[0]?.text).toBe("You are the copilot.");
    expect(rows[0]?.detail).toContain("── tools (1) ──");
    expect(rows[0]?.detail).toContain("navigate");
  });

  it("folds reasoning and text tokens into one assistant row", () => {
    const rows = buildInspectorTrajectory(
      events([
        { type: "REASONING_MESSAGE_CONTENT", delta: "Let's " },
        { type: "REASONING_MESSAGE_CONTENT", delta: "check." },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        { type: "TEXT_MESSAGE_CONTENT", delta: "Done" },
        { type: "TEXT_MESSAGE_CONTENT", delta: "." },
        { type: "TEXT_MESSAGE_END" },
      ])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("assistant");
    expect(rows[0]?.text).toBe("Done.");
    expect(rows[0]?.detail).toContain("Let's check.");
    expect(rows[0]?.detail).toContain("Done.");
  });

  it("keeps interleaved tool calls as separate rows", () => {
    const rows = buildInspectorTrajectory(
      events([
        { toolCallId: "a", toolCallName: "read", type: "TOOL_CALL_START" },
        { delta: '{"path":"a"}', toolCallId: "a", type: "TOOL_CALL_ARGS" },
        { toolCallId: "b", toolCallName: "bash", type: "TOOL_CALL_START" },
        {
          delta: '{"command":"sed -n 80,83p ports.py"}',
          toolCallId: "b",
          type: "TOOL_CALL_ARGS",
        },
        {
          content: "[80, 81, 82, 83]",
          toolCallId: "b",
          type: "TOOL_CALL_RESULT",
        },
      ])
    );

    expect(rows.map((row) => row.text)).toEqual([
      'read {"path":"a"}',
      'bash {"command":"sed -n 80,83p ports.py"}',
    ]);
    expect(rows[1]?.result).toBe("[80, 81, 82, 83]");
  });

  it("returns nothing for an empty stream", () => {
    expect(buildInspectorTrajectory([])).toEqual([]);
  });

  it("falls back to conversation messages when the wire stream has no speech", () => {
    const rows = buildInspectorTrajectory(
      events([{ type: "STATE_SNAPSHOT", snapshot: {} }]),
      [
        { content: "Fix ports.py", id: "u1", role: "user" },
        { content: "I'll inspect it.", id: "a1", role: "assistant" },
      ] as never
    );
    expect(rows.map((row) => row.kind)).toEqual(["user", "assistant"]);
    expect(rows[0]?.text).toBe("Fix ports.py");
    expect(rows[1]?.turnStart).toBe(true);
  });
});

describe("trajectoryTranscript", () => {
  it("renders a pasteable kind · text ledger", () => {
    const rows = buildInspectorTrajectory(
      events([
        { role: "user", type: "TEXT_MESSAGE_START" },
        { delta: "hello", type: "TEXT_MESSAGE_CONTENT" },
        { type: "TEXT_MESSAGE_END" },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        { delta: "hi", type: "TEXT_MESSAGE_CONTENT" },
        { type: "TEXT_MESSAGE_END" },
      ])
    );
    expect(trajectoryTranscript(rows)).toContain("USER  hello");
    expect(trajectoryTranscript(rows)).toContain("Turn 1  ASSISTANT  hi");
  });
});
