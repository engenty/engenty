/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type CopilotRunStatus,
  useCopilotMessageQueue,
} from "./use-copilot-message-queue.js";

function setup(initialStatus: CopilotRunStatus = "streaming") {
  const submit = vi.fn();
  const { result, rerender } = renderHook(
    ({
      status,
      threadId,
      blocked,
    }: {
      status: CopilotRunStatus;
      threadId?: string | null;
      blocked?: boolean;
    }) => useCopilotMessageQueue({ status, submit, threadId, blocked }),
    {
      initialProps: { status: initialStatus } as {
        status: CopilotRunStatus;
        threadId?: string | null;
        blocked?: boolean;
      },
    }
  );
  return { rerender, result, submit };
}

describe("useCopilotMessageQueue", () => {
  it("enqueues messages (and ignores blanks)", () => {
    const { result } = setup();
    act(() => {
      result.current.enqueue("first");
      result.current.enqueue("   ");
      result.current.enqueue("second");
    });
    expect(result.current.queued.map((m) => m.text)).toEqual([
      "first",
      "second",
    ]);
    expect(result.current.hasQueued).toBe(true);
  });

  it("removes and reorders queued messages", () => {
    const { result } = setup();
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
      result.current.enqueue("c");
    });
    const bId = result.current.queued[1]!.id;
    act(() => result.current.move(bId, "up"));
    expect(result.current.queued.map((m) => m.text)).toEqual(["b", "a", "c"]);
    act(() => result.current.remove(bId));
    expect(result.current.queued.map((m) => m.text)).toEqual(["a", "c"]);
  });

  it("reorders via drag (move an item to another's position)", () => {
    const { result } = setup();
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
      result.current.enqueue("c");
    });
    const cId = result.current.queued[2]!.id;
    const aId = result.current.queued[0]!.id;
    // Drag c onto a's slot → c, a, b.
    act(() => result.current.reorder(cId, aId));
    expect(result.current.queued.map((m) => m.text)).toEqual(["c", "a", "b"]);
  });

  it("move is a no-op at the ends", () => {
    const { result } = setup();
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
    });
    const firstId = result.current.queued[0]!.id;
    act(() => result.current.move(firstId, "up"));
    expect(result.current.queued.map((m) => m.text)).toEqual(["a", "b"]);
  });

  it("sendNow submits immediately (stop + send) and removes that entry, keeping the rest", () => {
    const { result, submit } = setup();
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
    });
    const bId = result.current.queued[1]!.id;
    act(() => result.current.sendNow(bId));
    expect(submit).toHaveBeenCalledWith("b", undefined);
    expect(result.current.queued.map((m) => m.text)).toEqual(["a"]);
  });

  it("auto-drains the head when the thread returns to ready", () => {
    const { result, rerender, submit } = setup("streaming");
    act(() => {
      result.current.enqueue("one");
      result.current.enqueue("two");
    });
    // Still running — nothing sent yet.
    expect(submit).not.toHaveBeenCalled();

    // Run finishes → head sent, removed from the queue.
    act(() => rerender({ status: "ready" }));
    expect(submit).toHaveBeenNthCalledWith(1, "one", undefined);
    expect(result.current.queued.map((m) => m.text)).toEqual(["two"]);

    // Next run runs then finishes → second drains.
    act(() => rerender({ status: "streaming" }));
    act(() => rerender({ status: "ready" }));
    expect(submit).toHaveBeenNthCalledWith(2, "two", undefined);
    expect(result.current.queued).toHaveLength(0);
  });

  it("does not double-drain while status stays ready", () => {
    const { result, rerender, submit } = setup("ready");
    act(() => result.current.enqueue("only"));
    act(() => rerender({ status: "ready" })); // head drains once
    act(() => rerender({ status: "ready" })); // still ready, no re-drain
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does NOT drain while blocked (an approval interrupt is open)", () => {
    const { result, rerender, submit } = setup("streaming");
    act(() => result.current.enqueue("queued"));
    // Run pauses for an interrupt: status ready but blocked → no send.
    act(() => rerender({ status: "ready", blocked: true }));
    expect(submit).not.toHaveBeenCalled();
    expect(result.current.queued.map((m) => m.text)).toEqual(["queued"]);
    // Interrupt resolved and run truly finished → drains now.
    act(() => rerender({ status: "ready", blocked: false }));
    expect(submit).toHaveBeenCalledWith("queued", undefined);
  });

  it("resets the queue on thread change (no replay into another thread)", () => {
    const { result, rerender, submit } = setup("streaming");
    act(() => rerender({ status: "streaming", threadId: "thread-a" }));
    act(() => result.current.enqueue("for-a"));
    expect(result.current.queued).toHaveLength(1);
    // Switch to a different thread (e.g. "New chat") → queue clears.
    act(() => rerender({ status: "streaming", threadId: "thread-b" }));
    expect(result.current.queued).toHaveLength(0);
    // Even when the new thread goes ready, nothing from thread-a replays.
    act(() => rerender({ status: "ready", threadId: "thread-b" }));
    expect(submit).not.toHaveBeenCalled();
  });

  it("clear() discards every queued message", () => {
    const { result } = setup("streaming");
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
    });
    act(() => result.current.clear());
    expect(result.current.queued).toHaveLength(0);
    expect(result.current.hasQueued).toBe(false);
  });
});
