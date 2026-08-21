import { AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approveCopilotOpenInterrupt } from "./approve-copilot-open-interrupt.js";

function frontendInterrupt() {
  return {
    artifact_id: "a1",
    interrupt_id: "int-1",
    kind: "frontend_tool" as const,
    title: "Offer downloads",
    tool_call_id: "call-1",
    tool_name: "navigate",
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("approveCopilotOpenInterrupt (frontend tool)", () => {
  it("resumes with the handler output on success", async () => {
    const resumeInterrupt = vi.fn();
    await approveCopilotOpenInterrupt({
      activeThreadId: "t1",
      executeFrontendTool: () => ({ ok: true }),
      open: frontendInterrupt(),
      resumeInterrupt,
    });
    expect(resumeInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({ approved: true, output: { ok: true } })
    );
  });

  it("resumes with a couldn't-resolve error when the handler never settles", async () => {
    vi.useFakeTimers();
    const resumeInterrupt = vi.fn();
    // Handler that never resolves — simulates a missing/hung executor.
    const promise = approveCopilotOpenInterrupt({
      activeThreadId: "t1",
      executeFrontendTool: () => new Promise<never>(() => undefined),
      open: frontendInterrupt(),
      resumeInterrupt,
    });
    await vi.advanceTimersByTimeAsync(
      AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS + 1
    );
    await promise;

    expect(resumeInterrupt).toHaveBeenCalledTimes(1);
    const arg = resumeInterrupt.mock.calls[0][0];
    expect(arg.approved).toBe(false);
    expect(arg.error).toMatch(/did not resolve/i);
  });
});
