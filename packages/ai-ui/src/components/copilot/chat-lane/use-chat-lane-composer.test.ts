/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentHost } from "../../../agent-provider/types.js";

// The composer resolves interrupts through the app shell's frontend-tool
// executor; these tests are about what it does with a typed message.
vi.mock("@engenty/app-shell", () => ({
  useAgentUiFrontendToolExecutor: () => null,
}));

const { useChatLaneComposer } = await import("./use-chat-lane-composer.js");

function host(overrides: Partial<AgentHost> = {}): AgentHost {
  return {
    activeThreadId: "t1",
    awaitingInterrupt: false,
    cancel: vi.fn(),
    messages: [],
    openInterruptFromStream: null,
    pendingInterruptToolCallIds: new Set(),
    resolvedInterruptToolCallIds: new Set(),
    resumeInterrupt: vi.fn(),
    submitMessage: vi.fn(),
    threadId: "t1",
    ...overrides,
  } as unknown as AgentHost;
}

function render(agentHost: AgentHost, status: "ready" | "streaming") {
  return renderHook(() =>
    useChatLaneComposer({
      host: agentHost,
      messages: [],
      openInterruptFromSession: null,
      status,
      threadKey: "t1",
    } as never)
  );
}

describe("useChatLaneComposer while a run is in flight", () => {
  it("steers into a run this window did not start, and never cancels it", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: "run-other", steer });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("Tom, say the move number.");
    });

    expect(steer).toHaveBeenCalledWith("Tom, say the move number.", undefined);
    expect(agentHost.cancel).not.toHaveBeenCalled();
    expect(agentHost.submitMessage).not.toHaveBeenCalled();
    expect(result.current.queue.queued).toEqual([]);
  });

  it("queues the words when the attached run ended before they landed", async () => {
    const agentHost = host({
      attachedRunId: "run-other",
      steer: vi.fn(async () => false),
    });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("late");
    });

    expect(result.current.queue.queued.map((row) => row.text)).toEqual([
      "late",
    ]);
  });

  it("still queues behind this window's own run", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: null, steer });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("mine");
    });

    expect(steer).not.toHaveBeenCalled();
    expect(result.current.queue.queued.map((row) => row.text)).toEqual([
      "mine",
    ]);
  });
});
