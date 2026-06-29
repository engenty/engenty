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
    ({ status }: { status: CopilotRunStatus }) =>
      useCopilotMessageQueue({ status, submit }),
    { initialProps: { status: initialStatus } }
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
    expect(submit).toHaveBeenCalledWith("b");
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
    expect(submit).toHaveBeenNthCalledWith(1, "one");
    expect(result.current.queued.map((m) => m.text)).toEqual(["two"]);

    // Next run runs then finishes → second drains.
    act(() => rerender({ status: "streaming" }));
    act(() => rerender({ status: "ready" }));
    expect(submit).toHaveBeenNthCalledWith(2, "two");
    expect(result.current.queued).toHaveLength(0);
  });

  it("does not double-drain while status stays ready", () => {
    const { result, rerender, submit } = setup("ready");
    act(() => result.current.enqueue("only"));
    act(() => rerender({ status: "ready" })); // head drains once
    act(() => rerender({ status: "ready" })); // still ready, no re-drain
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
