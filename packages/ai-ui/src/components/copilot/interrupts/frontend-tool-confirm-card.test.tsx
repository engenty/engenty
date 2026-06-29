/** @vitest-environment happy-dom */
import { buildFrontendToolOpenInterrupt } from "@engenty/ag-ui-bridge";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FrontendToolConfirmCard,
  frontendToolConfirmFromOpenInterrupt,
} from "./frontend-tool-confirm-card.js";

afterEach(() => {
  cleanup();
});

describe("frontendToolConfirmFromOpenInterrupt", () => {
  it("returns null for decision interrupts", () => {
    const open = buildFrontendToolOpenInterrupt({
      artifact_id: "a",
      interrupt_id: "i",
      title: "Confirm",
      tool_call_id: "tc",
      tool_input: {},
      tool_name: "contacts_apply_draft_patch",
    });
    expect(
      frontendToolConfirmFromOpenInterrupt({
        ...open,
        choices: [{ id: "yes", label: "Yes" }],
        kind: "decision",
      })
    ).toBeNull();
  });
});

describe("FrontendToolConfirmCard", () => {
  const open = buildFrontendToolOpenInterrupt({
    artifact_id: "call-1",
    interrupt_id: "call-1",
    title: "Apply draft patch",
    tool_call_id: "tc-1",
    tool_input: { field: "name", value: "Ada" },
    tool_name: "contacts_apply_draft_patch",
  });

  it("renders title, tool name, and approve/reject actions", () => {
    render(
      <FrontendToolConfirmCard
        onApprove={vi.fn()}
        onReject={vi.fn()}
        open={open}
      />
    );

    expect(
      screen.getByRole("heading", { name: /apply draft patch/i })
    ).toBeTruthy();
    expect(screen.getByText("contacts_apply_draft_patch")).toBeTruthy();
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reject/i })).toBeTruthy();
  });

  it("calls approve and reject handlers", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <FrontendToolConfirmCard
        onApprove={onApprove}
        onReject={onReject}
        open={open}
      />
    );

    await user.click(screen.getByRole("button", { name: /approve/i }));
    await user.click(screen.getByRole("button", { name: /reject/i }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });
});
