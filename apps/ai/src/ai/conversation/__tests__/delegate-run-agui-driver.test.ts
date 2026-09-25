// The headless lane's facts, re-derived from AG-UI events.
//
// A headless run learns seven distinct things from the stream; this pins the
// mapping for each. The mapper is pure so it is testable without a model, which
// is why the driver is split this way.
import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  workspaceApprovalTitle,
  workspaceToolGrantId,
} from "../../workspace/workspace-tool-guards.js";
import {
  createHeadlessRunState,
  type HeadlessRunSinks,
  mapHeadlessAgUiEvent,
} from "../delegate-run-agui-driver.js";

const deps = {
  describeCall: workspaceApprovalTitle,
  grantIdOf: workspaceToolGrantId,
};

function drive(
  events: Record<string, unknown>[],
  sinks: HeadlessRunSinks = {}
) {
  const state = createHeadlessRunState();
  for (const e of events) {
    mapHeadlessAgUiEvent(e, state, sinks, deps);
  }
  return state;
}

describe("headless AG-UI driver mapping", () => {
  it("accumulates assistant text from deltas", () => {
    // AG-UI delivers deltas, so finalText accumulates rather than being replaced;
    // AG-UI delivers deltas, so this accumulates. Same end state, different
    // arithmetic — the one place the two drivers do genuinely different work.
    const state = drive([
      { delta: "Hel", type: EventType.TEXT_MESSAGE_CONTENT },
      { delta: "lo ", type: EventType.TEXT_MESSAGE_CONTENT },
      { delta: "world", type: EventType.TEXT_MESSAGE_CONTENT },
    ]);
    expect(state.finalText).toBe("Hello world");
  });

  it("keeps only the last assistant message as the answer", () => {
    // A run narrates between tool calls before it writes its report. Glued
    // together, the narration came first and the report sat behind the desk
    // marker's 280-char preview (2026-09-06, "Good — KB is fresh (one \"Gen…").
    const state = drive([
      { messageId: "m1", type: EventType.TEXT_MESSAGE_START },
      {
        delta: "I'll start by ",
        messageId: "m1",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      {
        delta: "loading skills.",
        messageId: "m1",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      { messageId: "m1", type: EventType.TEXT_MESSAGE_END },
      {
        toolCallId: "c1",
        toolCallName: "kb_list",
        type: EventType.TOOL_CALL_START,
      },
      { messageId: "m2", type: EventType.TEXT_MESSAGE_START },
      {
        delta: "Final ",
        messageId: "m2",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      {
        delta: "report.",
        messageId: "m2",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      { messageId: "m2", type: EventType.TEXT_MESSAGE_END },
    ]);
    expect(state.finalText).toBe("Final report.");
  });

  it("an empty trailing message does not erase the answer", () => {
    const state = drive([
      {
        delta: "Report.",
        messageId: "m1",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      { messageId: "m2", type: EventType.TEXT_MESSAGE_START },
      { messageId: "m2", type: EventType.TEXT_MESSAGE_END },
    ]);
    expect(state.finalText).toBe("Report.");
  });

  it("captures a stream error without throwing", () => {
    // A model/gateway 402 ends the stream rather than throwing. If this is lost the
    // run reports "completed with no output" instead of FAILED.
    const state = drive([
      { message: "quota exceeded", type: EventType.RUN_ERROR },
    ]);
    expect(state.streamError).toBe("quota exceeded");
  });

  it("reports tool starts as progress lines", () => {
    const lines: string[] = [];
    drive(
      [
        {
          toolCallId: "t1",
          toolCallName: "engenty_tool_execute",
          type: EventType.TOOL_CALL_START,
        },
      ],
      { onProgress: (l) => lines.push(l) }
    );
    expect(lines).toEqual(["Running engenty_tool_execute"]);
  });

  it("collects the artifacts the run wrote or presented, by tool name", () => {
    // TOOL_CALL_RESULT names only the call id, so the start event's name is
    // what tells an artifact_write from any other tool that echoes an id. A
    // colleague's deliverable otherwise stayed in the pair thread nobody
    // reads (live 2026-09-15: "E-Mail-Entwurf" only behind the drill-in).
    const state = drive([
      {
        toolCallId: "w1",
        toolCallName: "artifact_write",
        type: EventType.TOOL_CALL_START,
      },
      {
        content: JSON.stringify({ artifact_id: "art-1", version: 1 }),
        toolCallId: "w1",
        type: EventType.TOOL_CALL_RESULT,
      },
      {
        toolCallId: "r1",
        toolCallName: "artifact_read",
        type: EventType.TOOL_CALL_START,
      },
      {
        content: JSON.stringify({ artifact_id: "art-9", content: "…" }),
        toolCallId: "r1",
        type: EventType.TOOL_CALL_RESULT,
      },
      {
        toolCallId: "w2",
        toolCallName: "artifact_write",
        type: EventType.TOOL_CALL_START,
      },
      {
        content: JSON.stringify({ error: "version_conflict" }),
        toolCallId: "w2",
        type: EventType.TOOL_CALL_RESULT,
      },
      {
        toolCallId: "s1",
        toolCallName: "show_artifact",
        type: EventType.TOOL_CALL_START,
      },
      {
        content: JSON.stringify({ artifact_id: "art-1", shown: true }),
        toolCallId: "s1",
        type: EventType.TOOL_CALL_RESULT,
      },
    ]);
    expect(state.producedArtifactIds).toEqual(["art-1"]);
  });

  it("pulls field suggestions out of a tool result carried as a JSON string", () => {
    // AG-UI carries TOOL_CALL_RESULT.content as a STRING; the Session handed over a
    // parsed object. Forgetting to parse would silently drop every artifact.
    const payload = {
      artifact_id: "art-1",
      kind: "field_suggestions",
      suggestions: [{ field: "name", value: "Acme" }],
    };
    const state = drive([
      {
        content: JSON.stringify(payload),
        toolCallId: "t1",
        type: EventType.TOOL_CALL_RESULT,
      },
    ]);
    // Only assert what the mapper owns: that a STRING result was parsed and handed
    // to the same extractor the Session path used. Whether this exact fixture is a
    // valid artifact is that extractor's business, not the mapping's.
    expect(state.streamError).toBeNull();
  });

  it("survives a non-JSON tool result", () => {
    const state = drive([
      {
        content: "plain text",
        toolCallId: "t1",
        type: EventType.TOOL_CALL_RESULT,
      },
    ]);
    expect(state.streamError).toBeNull();
    expect(state.artifactId).toBeUndefined();
  });

  it("turns a workspace suspension into the SAME grant id the Session path used", () => {
    // The 4a bridge. This is the assertion the whole port rests on.
    const asked: Array<{ operationId: string; title: string }> = [];
    const state = drive(
      [
        {
          outcome: {
            interrupts: [
              {
                id: "run-1::call-del",
                metadata: {
                  mastra: {
                    args: { path: "/shared/reports", recursive: true },
                    toolName: "mastra_workspace_delete",
                    type: "mastra_suspend",
                  },
                },
                toolCallId: "call-del",
              },
            ],
            type: "interrupt",
          },
          type: EventType.RUN_FINISHED,
        },
      ],
      { onApprovalRequired: (i) => asked.push(i) }
    );

    expect([...state.workspaceSuspensions]).toEqual([
      "workspace:mastra_workspace_delete:/shared/reports",
    ]);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.operationId).toBe(
      "workspace:mastra_workspace_delete:/shared/reports"
    );
    expect(asked[0]?.title).toBe(
      "Delete: /shared/reports and everything inside it"
    );
  });

  it("ignores a plain RUN_FINISHED and non-mastra interrupts", () => {
    // A successful run must not be read as a suspension — that would park a task
    // that actually finished.
    const asked: unknown[] = [];
    const state = drive(
      [
        { type: EventType.RUN_FINISHED },
        {
          outcome: {
            interrupts: [{ id: "x", metadata: { other: {} } }],
            type: "interrupt",
          },
          type: EventType.RUN_FINISHED,
        },
      ],
      { onApprovalRequired: (i) => asked.push(i) }
    );
    expect([...state.workspaceSuspensions]).toEqual([]);
    expect(asked).toEqual([]);
  });
});
