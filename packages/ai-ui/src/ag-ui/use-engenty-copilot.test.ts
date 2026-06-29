/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentHost } from "../agent-provider/types.js";
import { useEngentyCopilot } from "./use-engenty-copilot.js";

const submitMessage = vi.fn();
const cancel = vi.fn();
const useAgentHost = vi.fn();

vi.mock("../agent-provider/engenty-agent.js", () => ({
  useAgentHost: (hostKey?: string) => useAgentHost(hostKey),
}));

function hostStub(overrides: Partial<AgentHost> = {}): AgentHost {
  return {
    cancel,
    copilotMessages: [],
    error: null,
    hostKey: "engenty:copilot",
    status: "ready",
    submitMessage,
    threadId: "thread-1",
    ...overrides,
  } as unknown as AgentHost;
}

describe("useEngentyCopilot (Ch.4 BYO-UI facade)", () => {
  afterEach(() => vi.clearAllMocks());

  it("projects the AgentHost into the CK shape", () => {
    const messages = [{ id: "m1", role: "assistant" }];
    useAgentHost.mockReturnValue(
      hostStub({
        copilotMessages: messages as unknown as AgentHost["copilotMessages"],
        threadId: "thread-9",
      })
    );

    const { result } = renderHook(() => useEngentyCopilot());

    expect(result.current.messages).toBe(messages);
    expect(result.current.threadId).toBe("thread-9");
    expect(result.current.isRunning).toBe(false);

    result.current.send("hi");
    result.current.stop();
    expect(submitMessage).toHaveBeenCalledWith("hi");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    "submitted",
    "streaming",
  ] as const)("isRunning is true while status is %s", (status) => {
    useAgentHost.mockReturnValue(hostStub({ status }));
    const { result } = renderHook(() => useEngentyCopilot());
    expect(result.current.isRunning).toBe(true);
    expect(result.current.status).toBe(status);
  });

  it.each([
    "ready",
    "error",
  ] as const)("isRunning is false while status is %s", (status) => {
    useAgentHost.mockReturnValue(hostStub({ status }));
    const { result } = renderHook(() => useEngentyCopilot());
    expect(result.current.isRunning).toBe(false);
  });

  it("forwards hostKey to useAgentHost", () => {
    useAgentHost.mockReturnValue(hostStub());
    renderHook(() => useEngentyCopilot({ hostKey: "kb:search" }));
    expect(useAgentHost).toHaveBeenCalledWith("kb:search");
  });
});
