import { describe, expect, it } from "vitest";
import {
  buildAgUiOpenInterruptExpiresAt,
  buildFrontendToolOpenInterrupt,
  isAgUiOpenInterruptExpired,
  isFrontendToolOpenInterrupt,
  readAgUiOpenInterrupt,
} from "../engenty-open-interrupt.js";

describe("engenty open interrupt metadata", () => {
  it("reads open interrupt from session metadata", () => {
    expect(
      readAgUiOpenInterrupt({
        ag_ui_open_interrupt: {
          artifact_id: "artifact-1",
          body: "Pick one",
          choices: [{ id: "yes", label: "Yes" }],
          interrupt_id: "int-1",
          title: "Approve?",
          tool_call_id: "tc-1",
          expires_at: "2026-12-31T00:00:00.000Z",
        },
      })
    ).toEqual({
      artifact_id: "artifact-1",
      body: "Pick one",
      choices: [{ id: "yes", label: "Yes" }],
      expires_at: "2026-12-31T00:00:00.000Z",
      interrupt_id: "int-1",
      kind: "decision",
      title: "Approve?",
      tool_call_id: "tc-1",
    });
  });

  it("reads frontend_tool open interrupt from session metadata", () => {
    const open = readAgUiOpenInterrupt({
      ag_ui_open_interrupt: {
        artifact_id: "call-1",
        interrupt_id: "call-1",
        kind: "frontend_tool",
        title: "Apply patch",
        tool_call_id: "call-1",
        tool_name: "contacts_apply_draft_patch",
        tool_input: { patch: [] },
      },
    });
    expect(open).toEqual({
      artifact_id: "call-1",
      interrupt_id: "call-1",
      kind: "frontend_tool",
      title: "Apply patch",
      tool_call_id: "call-1",
      tool_name: "contacts_apply_draft_patch",
      tool_input: { patch: [] },
    });
    expect(isFrontendToolOpenInterrupt(open!)).toBe(true);
  });

  it("buildFrontendToolOpenInterrupt sets kind and tool fields", () => {
    const open = buildFrontendToolOpenInterrupt({
      artifact_id: "c1",
      interrupt_id: "c1",
      title: "Confirm",
      tool_call_id: "c1",
      tool_name: "navigate",
      tool_input: { to: "/x" },
    });
    expect(open.kind).toBe("frontend_tool");
    expect(open.tool_name).toBe("navigate");
  });

  it("detects expired interrupts", () => {
    const open = readAgUiOpenInterrupt({
      ag_ui_open_interrupt: {
        artifact_id: "a",
        interrupt_id: "i",
        title: "t",
        tool_call_id: "tc",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    });
    expect(open).not.toBeNull();
    expect(isAgUiOpenInterruptExpired(open!, Date.parse("2026-01-01"))).toBe(
      true
    );
  });

  it("builds default expiry timestamps", () => {
    const expiresAt = buildAgUiOpenInterruptExpiresAt(0, 60_000);
    expect(expiresAt).toBe("1970-01-01T00:01:00.000Z");
  });
});
