import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { describe, expect, it, vi } from "vitest";
import {
  approveCopilotOpenInterrupt,
  rejectCopilotOpenInterrupt,
} from "./approve-copilot-open-interrupt.js";

const baseOpen: AgUiOpenInterruptMetadata = {
  artifact_id: "artifact-1",
  interrupt_id: "interrupt-1",
  title: "Confirm action",
  tool_call_id: "call-1",
  tool_name: "example_tool",
};

describe("approveCopilotOpenInterrupt", () => {
  it("resumes sandbox_command without executing a frontend tool", async () => {
    const executeFrontendTool = vi.fn();
    const resumeInterrupt = vi.fn();
    const onSuccess = vi.fn();

    await approveCopilotOpenInterrupt({
      activeThreadId: "thread-1",
      executeFrontendTool,
      onSuccess,
      open: { ...baseOpen, kind: "sandbox_command" },
      resumeInterrupt,
    });

    expect(executeFrontendTool).not.toHaveBeenCalled();
    expect(resumeInterrupt).toHaveBeenCalledWith({
      approved: true,
      interruptId: "interrupt-1",
      toolName: "example_tool",
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("executes frontend tools before resuming approval", async () => {
    const executeFrontendTool = vi.fn().mockResolvedValue({ applied: true });
    const resumeInterrupt = vi.fn();

    await approveCopilotOpenInterrupt({
      activeThreadId: "thread-1",
      executeFrontendTool,
      open: { ...baseOpen, kind: "frontend_tool" },
      resumeInterrupt,
    });

    expect(executeFrontendTool).toHaveBeenCalledWith({
      call_id: "call-1",
      input: {},
      requires_confirmation: true,
      run_id: "thread-1",
      tool_name: "example_tool",
    });
    expect(resumeInterrupt).toHaveBeenCalledWith({
      approved: true,
      interruptId: "interrupt-1",
      output: { applied: true },
      toolName: "example_tool",
    });
  });

  it("surfaces the handler error (a tool failure, not a user rejection)", async () => {
    const executeFrontendTool = vi.fn().mockRejectedValue(new Error("boom"));
    const resumeInterrupt = vi.fn();

    await approveCopilotOpenInterrupt({
      activeThreadId: "thread-1",
      executeFrontendTool,
      open: { ...baseOpen, kind: "frontend_tool" },
      resumeInterrupt,
    });

    expect(resumeInterrupt).toHaveBeenCalledWith({
      approved: false,
      error: "boom",
      interruptId: "interrupt-1",
      toolName: "example_tool",
    });
  });

  it("no-ops when tool_name is missing", async () => {
    const executeFrontendTool = vi.fn();
    const resumeInterrupt = vi.fn();

    await approveCopilotOpenInterrupt({
      activeThreadId: "thread-1",
      executeFrontendTool,
      open: { ...baseOpen, tool_name: undefined },
      resumeInterrupt,
    });

    expect(executeFrontendTool).not.toHaveBeenCalled();
    expect(resumeInterrupt).not.toHaveBeenCalled();
  });
});

describe("rejectCopilotOpenInterrupt", () => {
  it("resumes with approved false", () => {
    const resumeInterrupt = vi.fn();

    rejectCopilotOpenInterrupt({
      open: { ...baseOpen, kind: "sandbox_command" },
      resumeInterrupt,
    });

    expect(resumeInterrupt).toHaveBeenCalledWith({
      approved: false,
      interruptId: "interrupt-1",
      toolName: "example_tool",
    });
  });
});
