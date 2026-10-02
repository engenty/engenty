/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentHost } from "../../../agent-provider/types.js";

// The composer resolves interrupts through the app shell's frontend-tool
// executor; these tests are about what it does with a typed message.
vi.mock("@engenty/app-shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@engenty/app-shell")>()),
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

    expect(steer).toHaveBeenCalledWith(
      "Tom, say the move number.",
      expect.anything()
    );
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

  it("steers into this window's own run too, and never cancels it", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: null, steer });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("mine");
    });

    expect(steer).toHaveBeenCalledWith("mine", expect.anything());
    expect(agentHost.cancel).not.toHaveBeenCalled();
    expect(result.current.queue.queued).toEqual([]);
  });

  it("Mod+Enter waits for the run instead of joining it", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: null, steer });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("after this", { queue: true });
    });

    expect(steer).not.toHaveBeenCalled();
    expect(agentHost.cancel).not.toHaveBeenCalled();
    expect(result.current.queue.queued.map((row) => row.text)).toEqual([
      "after this",
    ]);
  });

  it("a turn for another agent waits instead of joining this agent's run", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: null, steer });
    const { result } = render(agentHost, "streaming");

    await act(async () => {
      result.current.submitMessage("over to you", {
        requestedAgentId: "agent-b",
      });
    });

    expect(steer).not.toHaveBeenCalled();
    expect(result.current.queue.queued.map((row) => row.text)).toEqual([
      "over to you",
    ]);
  });

  it("send now on a queued message steers it instead of stopping the run", async () => {
    const steer = vi.fn(async () => true);
    const agentHost = host({ attachedRunId: null, steer });
    const { result } = render(agentHost, "streaming");
    await act(async () => {
      result.current.submitMessage("later", { queue: true });
    });

    await act(async () => {
      result.current.queue.sendNow(result.current.queue.queued[0]!.id);
    });

    expect(steer).toHaveBeenCalledWith("later", expect.anything());
    expect(agentHost.cancel).not.toHaveBeenCalled();
    expect(agentHost.submitMessage).not.toHaveBeenCalled();
  });
});

describe("useChatLaneComposer while a wizard step is docked", () => {
  function renderDocked(
    agentHost: AgentHost,
    dockedGate: { acceptsText: boolean; submitUtterance: (t: string) => void }
  ) {
    return renderHook(() =>
      useChatLaneComposer({
        dockedGate,
        host: agentHost,
        messages: [],
        openInterruptFromSession: null,
        status: "ready",
        threadKey: "t1",
      } as never)
    );
  }

  it("answers the step with the words instead of starting a turn", async () => {
    const submitUtterance = vi.fn();
    const agentHost = host();
    const { result } = renderDocked(agentHost, {
      acceptsText: true,
      submitUtterance,
    });

    await act(async () => {
      result.current.submitMessage("  Bitte kürzer.  ");
    });

    expect(submitUtterance).toHaveBeenCalledWith("Bitte kürzer.");
    expect(agentHost.submitMessage).not.toHaveBeenCalled();
    expect(result.current.queue.queued).toEqual([]);
  });

  it("refuses free text when the step takes none", async () => {
    const submitUtterance = vi.fn();
    const agentHost = host();
    const { result } = renderDocked(agentHost, {
      acceptsText: false,
      submitUtterance,
    });

    await act(async () => {
      result.current.submitMessage("anything");
    });

    expect(submitUtterance).not.toHaveBeenCalled();
    expect(agentHost.submitMessage).not.toHaveBeenCalled();
    expect(result.current.queue.queued).toEqual([]);
  });

  it("never steers an attached run while a step is docked", async () => {
    const steer = vi.fn(async () => true);
    const submitUtterance = vi.fn();
    const agentHost = host({ attachedRunId: "run-other", steer });
    const { result } = renderDocked(agentHost, {
      acceptsText: true,
      submitUtterance,
    });

    await act(async () => {
      result.current.submitMessage("redirect");
    });

    expect(steer).not.toHaveBeenCalled();
    expect(submitUtterance).toHaveBeenCalledWith("redirect");
  });
});

describe("useChatLaneComposer dock interrupt", () => {
  it("docks nothing for a pending interrupt the dock has no card for", () => {
    // Any dock element opens the composer flap, so an interrupt without a card
    // would open it around nothing.
    const agentHost = host({
      openInterruptFromStream: {
        interrupt_id: "i1",
        kind: "frontend_tool",
        tool_call_id: "tc-1",
        tool_name: "shell_set_language",
      },
      pendingInterruptToolCallIds: new Set(["tc-1"]),
    } as never);
    const { result } = render(agentHost, "streaming");

    expect(result.current.dockInterrupt).toBeNull();
  });

  it("docks a pending decision", () => {
    const agentHost = host({
      openInterruptFromStream: {
        artifact_id: "a1",
        choices: [{ id: "red", label: "Rot" }],
        interrupt_id: "a1",
        title: "Farbe",
        tool_call_id: "tc-2",
      },
      pendingInterruptToolCallIds: new Set(["tc-2"]),
    } as never);
    const { result } = render(agentHost, "streaming");

    expect(result.current.dockInterrupt?.tool_call_id).toBe("tc-2");
  });

  it("docks a pending feedback question", () => {
    // `requestFeedback` suspends natively: the transcript row carries only the
    // arguments, and the card comes from the open interrupt.
    const agentHost = host({
      openInterruptFromStream: {
        artifact_id: "f1",
        interrupt_id: "f1",
        kind: "feedback",
        title: "Was fehlt?",
        tool_call_id: "tc-f",
      },
      pendingInterruptToolCallIds: new Set(["tc-f"]),
    } as never);
    const { result } = renderHook(() =>
      useChatLaneComposer({
        host: agentHost,
        messages: [
          {
            id: "m1",
            parts: [
              {
                input: { title: "Was fehlt?" },
                state: "input-available",
                toolCallId: "tc-f",
                toolName: "requestFeedback",
                type: "dynamic-tool",
              },
            ],
            role: "assistant",
          },
        ],
        openInterruptFromSession: null,
        status: "streaming",
        threadKey: "t1",
      } as never)
    );

    expect(result.current.dockInterrupt?.kind).toBe("feedback");
    expect(result.current.dockInterrupt?.tool_call_id).toBe("tc-f");
  });
});
