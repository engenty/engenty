import { describe, expect, it } from "vitest";
import { AiSessionError } from "../../errors.js";
import {
  assertResumeMatchesOpenInterrupt,
  buildDecisionInterruptOutcome,
  buildFrontendToolInterruptOutcome,
  formatFrontendToolResumeToolResultContent,
  isFrontendToolResumePayload,
  readAgUiOpenInterrupt,
  resumePayloadToModelContent,
  runInputHasNewUserMessages,
} from "../interrupts.js";

describe("interrupt helpers", () => {
  it("builds AG-UI interrupt outcome for decision artifacts", () => {
    expect(
      buildDecisionInterruptOutcome({
        kind: "decision",
        artifact: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "yes", label: "Yes" }],
          title: "Approve?",
        },
        interruptId: "int-1",
        toolCallId: "tc-1",
      })
    ).toEqual({
      interrupts: [
        {
          id: "int-1",
          message: "Approve?",
          reason: "tool_call",
          toolCallId: "tc-1",
        },
      ],
      type: "interrupt",
    });
  });

  it("reads and validates open interrupt metadata", () => {
    const open = readAgUiOpenInterrupt({
      ag_ui_open_interrupt: {
        artifact_id: "artifact-1",
        interrupt_id: "int-1",
        title: "Approve?",
        tool_call_id: "tc-1",
      },
    });
    expect(open).toEqual({
      artifact_id: "artifact-1",
      interrupt_id: "int-1",
      kind: "decision",
      title: "Approve?",
      tool_call_id: "tc-1",
    });
    expect(() =>
      assertResumeMatchesOpenInterrupt({
        open,
        resume: [{ interruptId: "wrong", status: "resolved" }],
        threadId: "session-1",
      })
    ).toThrow(AiSessionError);
  });

  it("rejects expired open interrupts on resume", () => {
    const open = readAgUiOpenInterrupt({
      ag_ui_open_interrupt: {
        artifact_id: "artifact-1",
        interrupt_id: "int-1",
        title: "Approve?",
        tool_call_id: "tc-1",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    });
    expect(() =>
      assertResumeMatchesOpenInterrupt({
        nowMs: Date.parse("2026-01-01"),
        open,
        resume: [{ interruptId: "int-1", status: "resolved" }],
        threadId: "session-1",
      })
    ).toThrow(AiSessionError);
  });

  it("rejects duplicate resume when no open interrupt remains", () => {
    expect(() =>
      assertResumeMatchesOpenInterrupt({
        open: null,
        resume: [{ interruptId: "int-1", status: "resolved" }],
        threadId: "session-1",
      })
    ).toThrow(AiSessionError);
  });

  it("rejects resume runs that include new user messages", () => {
    expect(
      runInputHasNewUserMessages({
        context: [],
        messages: [{ id: "m1", role: "user", content: "Hi" }],
        resume: [{ interruptId: "int-1", status: "resolved" }],
        runId: "run-1",
        state: {},
        threadId: "thread-1",
        tools: [],
      })
    ).toBe(true);
  });

  it("formats cancelled resume for the model", () => {
    expect(
      resumePayloadToModelContent({
        interruptId: "int-1",
        status: "cancelled",
      })
    ).toBe("The user cancelled the decision.");
  });

  it("formats frontend tool approve/reject resume for the model", () => {
    expect(
      resumePayloadToModelContent({
        interruptId: "call-1",
        payload: { approved: true, output: { ok: true } },
        status: "resolved",
      })
    ).toContain("approved");
    expect(
      resumePayloadToModelContent({
        interruptId: "call-1",
        payload: { rejected: true },
        status: "resolved",
      })
    ).toContain("rejected");
  });

  it("builds frontend tool interrupt outcome", () => {
    expect(
      buildFrontendToolInterruptOutcome({
        kind: "frontend_tool",
        interruptId: "call-1",
        runId: "run-1",
        title: "Apply patch",
        toolCallId: "call-1",
        toolName: "contacts_apply_draft_patch",
      })
    ).toMatchObject({
      type: "interrupt",
      interrupts: [{ id: "call-1", reason: "tool_call" }],
    });
  });

  it("formats frontend tool TOOL_CALL_RESULT on resume", () => {
    const open = readAgUiOpenInterrupt({
      ag_ui_open_interrupt: {
        artifact_id: "call-1",
        interrupt_id: "call-1",
        kind: "frontend_tool",
        title: "Apply",
        tool_call_id: "call-1",
        tool_name: "contacts_apply_draft_patch",
      },
    });
    expect(isFrontendToolResumePayload(open)).toBe(true);
    const content = formatFrontendToolResumeToolResultContent({
      open: open!,
      resume: {
        interruptId: "call-1",
        payload: { approved: true, output: { ok: true } },
        status: "resolved",
      },
      runId: "run-1",
    });
    expect(JSON.parse(content)).toMatchObject({
      call_id: "call-1",
      tool_name: "contacts_apply_draft_patch",
      output: { ok: true },
    });
  });
});
