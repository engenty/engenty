import type { AGUIEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  buildInspectorTrajectory,
  runEventRecordsToAgUi,
  trajectoryRowKeyPreview,
  trajectoryTranscript,
} from "../trajectory.js";

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
            runtimeContextInstructions: "Read-only: ports.py",
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
    expect(rows[0]?.text).toBe("You are a coding agent.");
    expect(rows[0]?.detail).toContain("You are a coding agent.");
    expect(rows[0]?.detail).toContain("── tools (1) ──");
    expect(rows[0]?.detail).toContain("read");
    expect(rows[1]?.text).toContain("off-by-one");
    expect(rows[2]?.text).toContain("Current runtime context");
    expect(rows[3]?.text).toBe("I'll inspect ports.py first.");
    expect(rows[3]?.turnStart).toBe(true);
    expect(rows[3]?.turn).toBe(1);
    expect(rows[4]?.text).toBe('read {"file_path":"ports.py"}');
    expect(rows[4]?.keyLabel).toBe("read");
    expect(rows[4]?.result).toContain("def ports()");
    expect(rows[5]?.text).toContain("off-by-one is in the range");
  });

  it("still projects a legacy modelMessages payload as SYSTEM", () => {
    const rows = buildInspectorTrajectory(
      events([
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
      ])
    );
    expect(rows.map((row) => row.kind)).toEqual(["system", "context"]);
    expect(rows[0]?.detail).toContain("You are a coding agent.");
  });

  it("projects recalled message pointers as HISTORY", () => {
    const rows = buildInspectorTrajectory(
      events([
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            recalledMessages: [
              {
                authorUserId: null,
                chars: 48,
                id: "11111111-1111-4111-8111-111111111111",
                preview: "Aktienkurse alle 10 Minuten",
                role: "user",
              },
              {
                chars: 120,
                id: "msg-2",
                preview: "DAX 24.102, +0.4%",
                role: "assistant",
              },
            ],
            runtimeContextInstructions: "",
            systemInstructions: "You are the finance specialist.",
            toolNames: ["web_search"],
          },
        },
      ])
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "system",
      "history",
      "history",
    ]);
    expect(rows[1]?.text).toBe(
      "agent  11111111…  48c  Aktienkurse alle 10 Minuten"
    );
    expect(rows[1]?.keyLabel).toBe("agent");
    expect(rows[1]?.detail).toContain(
      "id  11111111-1111-4111-8111-111111111111"
    );
    expect(rows[1]?.detail).toContain("Aktienkurse alle 10 Minuten");
    expect(rows[2]?.text).toBe("assistant  msg-2  120c  DAX 24.102, +0.4%");
    expect(rows[2]?.keyLabel).toBe("assistant");
    expect(rows[2]?.detail).toContain("id  msg-2");
  });

  it("tags recalled user-role rows as human vs agent from authorUserId", () => {
    const rows = buildInspectorTrajectory(
      events([
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            recalledMessages: [
              {
                authorUserId: "01a019fe-0000-4000-8000-000000000001",
                chars: 20,
                id: "human-1",
                preview: "please check quotes",
                role: "user",
              },
              {
                authorUserId: null,
                chars: 12,
                id: "synth-1",
                preview: "run the tick",
                role: "user",
              },
            ],
            systemInstructions: "You are the finance specialist.",
          },
        },
      ])
    );
    expect(rows.map((row) => row.keyLabel)).toEqual([null, "human", "agent"]);
    expect(rows[1]?.text).toContain("human");
    expect(rows[1]?.detail).toContain(
      "author  01a019fe-0000-4000-8000-000000000001"
    );
    expect(rows[2]?.text).toContain("agent");
  });

  it("does not present a tool-name list as the system prompt", () => {
    const rows = buildInspectorTrajectory(
      events([
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            runtimeContextInstructions: "Space: company",
            systemInstructions: "",
            toolNames: ["navigate", "shell_set_theme"],
          },
        },
      ])
    );
    expect(rows[0]?.kind).toBe("system");
    expect(rows[0]?.text).toContain("System instructions were not captured");
    expect(rows[0]?.text).not.toMatch(/^Tools:/);
    expect(rows[0]?.detail.startsWith("navigate")).toBe(false);
    expect(rows[0]?.detail).toContain("── tools (2) ──");
  });

  it("folds reasoning and text tokens into one assistant row", () => {
    const rows = buildInspectorTrajectory(
      events([
        { delta: "Let's ", type: "REASONING_MESSAGE_CONTENT" },
        { delta: "check.", type: "REASONING_MESSAGE_CONTENT" },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        { delta: "Done", type: "TEXT_MESSAGE_CONTENT" },
        { delta: ".", type: "TEXT_MESSAGE_CONTENT" },
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

  it("counts a headless run as turn 1 when there is no USER row", () => {
    const rows = buildInspectorTrajectory(
      events([
        {
          name: "engenty.debug.initial_prompt",
          type: "CUSTOM",
          value: {
            runtimeContextInstructions: "",
            systemInstructions: "You are the finance specialist.",
            toolNames: ["web_search"],
          },
        },
        {
          toolCallId: "s1",
          toolCallName: "web_search",
          type: "TOOL_CALL_START",
        },
        { toolCallId: "s1", type: "TOOL_CALL_END" },
        { role: "assistant", type: "TEXT_MESSAGE_START" },
        { delta: "DAX is up.", type: "TEXT_MESSAGE_CONTENT" },
        { type: "TEXT_MESSAGE_END" },
      ])
    );
    const body = rows.filter((row) => row.kind !== "system");
    expect(body.map((row) => row.kind)).toEqual(["tool", "assistant"]);
    expect(body[0]?.turn).toBe(1);
    expect(body[0]?.turnStart).toBe(true);
    expect(body[1]?.turn).toBe(1);
  });

  it("falls back to conversation messages when the wire stream has no speech", () => {
    const rows = buildInspectorTrajectory(
      events([{ snapshot: {}, type: "STATE_SNAPSHOT" }]),
      [
        { content: "Fix ports.py", id: "u1", role: "user" },
        { content: "I'll inspect it.", id: "a1", role: "assistant" },
      ]
    );
    expect(rows.map((row) => row.kind)).toEqual(["user", "assistant"]);
    expect(rows[0]?.text).toBe("Fix ports.py");
    expect(rows[1]?.turnStart).toBe(true);
  });
});

describe("trajectoryRowKeyPreview", () => {
  it("strips the key from the collapsed preview", () => {
    expect(
      trajectoryRowKeyPreview({
        keyLabel: "user",
        text: "user  01a044e2…  1331c  <turn",
      })
    ).toBe("01a044e2…  1331c  <turn");
    expect(
      trajectoryRowKeyPreview({
        keyLabel: "web_search",
        text: 'web_search {"query":"AAPL"}',
      })
    ).toBe('{"query":"AAPL"}');
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

describe("runEventRecordsToAgUi", () => {
  it("uses payload.type when present and fills type from event_type otherwise", () => {
    expect(
      runEventRecordsToAgUi([
        {
          event_type: "CUSTOM",
          payload: { name: "engenty.debug.initial_prompt", type: "CUSTOM" },
        },
        { event_type: "RUN_STARTED", payload: { runId: "r1" } },
      ])
    ).toEqual([
      { name: "engenty.debug.initial_prompt", type: "CUSTOM" },
      { runId: "r1", type: "RUN_STARTED" },
    ]);
  });
});
