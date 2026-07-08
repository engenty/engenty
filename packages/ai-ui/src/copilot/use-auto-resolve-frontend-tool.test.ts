/** @vitest-environment happy-dom */
import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoResolveFrontendTool } from "./use-auto-resolve-frontend-tool.js";

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

describe("useAutoResolveFrontendTool", () => {
  afterEach(() => vi.clearAllMocks());

  it("auto-executes + resumes a frontend tool interrupt, once", async () => {
    const executeFrontendTool = vi.fn(async () => ({ ok: true }));
    const resumeInterrupt = vi.fn();
    const { rerender } = renderHook(() =>
      useAutoResolveFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: true,
        executeFrontendTool,
        openInterrupt: interruptFor("shell_set_theme"),
        resumeInterrupt,
      })
    );

    await vi.waitFor(() => {
      expect(executeFrontendTool).toHaveBeenCalledWith(
        expect.objectContaining({ tool_name: "shell_set_theme" })
      );
      expect(resumeInterrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          approved: true,
          interruptId: "int-1",
          toolName: "shell_set_theme",
        })
      );
    });

    // Idempotent per interrupt id — re-render must not double-execute.
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(executeFrontendTool).toHaveBeenCalledTimes(1);
    expect(resumeInterrupt).toHaveBeenCalledTimes(1);
  });

  it("does nothing for non-frontend-tool interrupts", async () => {
    const executeFrontendTool = vi.fn(async () => ({ ok: true }));
    const resumeInterrupt = vi.fn();
    renderHook(() =>
      useAutoResolveFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: true,
        executeFrontendTool,
        openInterrupt: {
          ...interruptFor("some_tool"),
          kind: "decision",
        } as AgUiOpenInterruptMetadata,
        resumeInterrupt,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(executeFrontendTool).not.toHaveBeenCalled();
    expect(resumeInterrupt).not.toHaveBeenCalled();
  });

  it("resumes with approved=false and the error when the handler throws", async () => {
    const executeFrontendTool = vi.fn(async () => {
      throw new Error("handler exploded");
    });
    const resumeInterrupt = vi.fn();
    renderHook(() =>
      useAutoResolveFrontendTool({
        activeThreadId: "thread-1",
        awaitingInterrupt: true,
        executeFrontendTool,
        openInterrupt: interruptFor("shell_set_theme"),
        resumeInterrupt,
      })
    );
    await vi.waitFor(() => {
      expect(resumeInterrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          approved: false,
          error: "handler exploded",
          toolName: "shell_set_theme",
        })
      );
    });
  });
});
