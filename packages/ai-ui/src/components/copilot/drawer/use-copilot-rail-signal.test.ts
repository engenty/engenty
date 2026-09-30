/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const hostRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../agent-provider/engenty-agent.js", () => ({
  useOptionalAgentHostByKey: () => hostRef.current,
}));

const { useCopilotRailSignal } = await import("./use-copilot-rail-signal.js");

function host(overrides: Record<string, unknown>) {
  return {
    awaitingInterrupt: false,
    messages: [],
    openInterruptFromStream: null,
    status: "ready",
    ...overrides,
  };
}

const reply = [
  {
    id: "u1",
    content: "Richte den Space ein",
    role: "user",
  },
  {
    id: "a1",
    content: "Alles steht.\n\nDetails folgen.",
    role: "assistant",
  },
];

describe("useCopilotRailSignal", () => {
  it("keeps a reply that finished while closed until the copilot opens", () => {
    hostRef.current = host({ status: "streaming" });
    const { rerender, result } = renderHook(
      (props: { visible: boolean }) => useCopilotRailSignal(props),
      { initialProps: { visible: false } }
    );
    expect(result.current.kind).toBe("working");

    hostRef.current = host({ messages: reply, status: "ready" });
    rerender({ visible: false });
    expect(result.current).toEqual({ kind: "reply", text: "Alles steht." });

    rerender({ visible: true });
    expect(result.current.kind).toBe("idle");
    rerender({ visible: false });
    expect(result.current.kind).toBe("idle");
  });

  it("signals nothing for a reply the person watched arrive", () => {
    hostRef.current = host({ status: "streaming" });
    const { rerender, result } = renderHook(
      (props: { visible: boolean }) => useCopilotRailSignal(props),
      { initialProps: { visible: true } }
    );
    hostRef.current = host({ messages: reply, status: "ready" });
    rerender({ visible: true });
    rerender({ visible: false });
    expect(result.current.kind).toBe("idle");
  });

  it("names the open question while the copilot waits", () => {
    hostRef.current = host({
      awaitingInterrupt: true,
      openInterruptFromStream: { title: "Wohin soll dieser Space zuerst?" },
    });
    const { result } = renderHook(() =>
      useCopilotRailSignal({ visible: false })
    );
    expect(result.current).toEqual({
      kind: "waiting",
      text: "Wohin soll dieser Space zuerst?",
    });
  });
});
