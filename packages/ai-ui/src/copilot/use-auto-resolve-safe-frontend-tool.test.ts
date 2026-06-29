/** @vitest-environment happy-dom */
import {
  type AgUiOpenInterruptMetadata,
  createFrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoResolveSafeFrontendTool } from "./use-auto-resolve-safe-frontend-tool.js";

const safeTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "Set theme",
  name: "shell_set_theme",
  parameters: { type: "object" },
  safety: "safe",
});
const confirmTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "Delete everything",
  name: "danger_tool",
  parameters: { type: "object" },
  safety: "requires_confirmation",
});

function interruptFor(toolName: string): AgUiOpenInterruptMetadata {
  return {
    artifact_id: "int-1",
    interrupt_id: "int-1",
    kind: "frontend_tool",
    title: toolName,
    tool_call_id: "call-1",
    tool_input: { theme: "dark" },
    tool_name: toolName,
  };
}

describe("useAutoResolveSafeFrontendTool", () => {
  afterEach(() => vi.clearAllMocks());

  it("auto-executes + resumes a SAFE frontend tool interrupt, once", async () => {
    const executeFrontendTool = vi.fn(async () => ({ ok: true }));
    const resumeInterrupt = vi.fn();
    const { rerender } = renderHook(() =>
      useAutoResolveSafeFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: true,
        executeFrontendTool,
        frontendTools: [safeTool],
        openInterrupt: interruptFor("shell_set_theme"),
        resumeInterrupt,
      })
    );

    await waitFor(() => {
      expect(executeFrontendTool).toHaveBeenCalledWith(
        expect.objectContaining({ tool_name: "shell_set_theme" })
      );
      expect(resumeInterrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          approved: true,
          interruptId: "int-1",
          output: { ok: true },
          toolName: "shell_set_theme",
        })
      );
    });

    // Idempotent: re-render with the same interrupt does not fire again.
    rerender();
    expect(executeFrontendTool).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-resolve a requires_confirmation tool (left for the chooser)", async () => {
    const executeFrontendTool = vi.fn(async () => ({ ok: true }));
    const resumeInterrupt = vi.fn();
    renderHook(() =>
      useAutoResolveSafeFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: true,
        executeFrontendTool,
        frontendTools: [confirmTool],
        openInterrupt: interruptFor("danger_tool"),
        resumeInterrupt,
      })
    );
    await Promise.resolve();
    expect(executeFrontendTool).not.toHaveBeenCalled();
    expect(resumeInterrupt).not.toHaveBeenCalled();
  });

  it("does nothing when not awaiting an interrupt", async () => {
    const executeFrontendTool = vi.fn(async () => ({ ok: true }));
    const resumeInterrupt = vi.fn();
    renderHook(() =>
      useAutoResolveSafeFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: false,
        executeFrontendTool,
        frontendTools: [safeTool],
        openInterrupt: interruptFor("shell_set_theme"),
        resumeInterrupt,
      })
    );
    await Promise.resolve();
    expect(executeFrontendTool).not.toHaveBeenCalled();
  });
});
