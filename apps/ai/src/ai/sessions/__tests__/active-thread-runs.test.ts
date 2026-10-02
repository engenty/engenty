import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActiveThreadRun,
  noteThreadRunStarting,
  registerActiveThreadRun,
  resetActiveThreadRunsForTests,
  steerActiveThreadRun,
} from "../active-thread-runs.js";

afterEach(() => {
  resetActiveThreadRunsForTests();
});

function agentAccepting(action: string) {
  return {
    sendMessage: vi.fn(() => ({ accepted: Promise.resolve({ action }) })),
  };
}

describe("active thread runs", () => {
  it("steers into the run registered for the thread and discards on an idle loop", async () => {
    const agent = agentAccepting("deliver");
    registerActiveThreadRun("t1", { agent, resourceId: "r1", runId: "run-1" });

    const steered = await steerActiveThreadRun({
      authorName: "Matthias",
      text: "Stop, Tom is O.",
      threadId: "t1",
    });
    expect(steered).toEqual({ runId: "run-1", steered: true });
    expect(agent.sendMessage).toHaveBeenCalledWith(
      { attributes: { name: "Matthias" }, contents: "Stop, Tom is O." },
      { ifIdle: { behavior: "discard" }, resourceId: "r1", threadId: "t1" }
    );
  });

  it("reports not steered when nothing runs, or when Mastra found the thread idle", async () => {
    expect(await steerActiveThreadRun({ text: "hi", threadId: "t9" })).toEqual({
      steered: false,
    });
    registerActiveThreadRun("t2", {
      agent: agentAccepting("discard"),
      resourceId: "r",
      runId: "run-2",
    });
    expect(await steerActiveThreadRun({ text: "hi", threadId: "t2" })).toEqual({
      steered: false,
    });
  });

  it("a message sent while the turn is still starting reaches its loop", async () => {
    noteThreadRunStarting("t4");
    const steering = steerActiveThreadRun({
      text: "only Tyrol",
      threadId: "t4",
    });
    const agent = agentAccepting("deliver");
    registerActiveThreadRun("t4", { agent, resourceId: "r", runId: "run-4" });

    expect(await steering).toEqual({ runId: "run-4", steered: true });
    expect(agent.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("a turn that never started releases a waiting message to the queue", async () => {
    const release = noteThreadRunStarting("t5");
    const steering = steerActiveThreadRun({ text: "hi", threadId: "t5" });
    release();

    expect(await steering).toEqual({ steered: false });
  });

  it("a release only clears its own registration", () => {
    const releaseFirst = registerActiveThreadRun("t3", {
      agent: {},
      resourceId: "r",
      runId: "run-a",
    });
    registerActiveThreadRun("t3", {
      agent: {},
      resourceId: "r",
      runId: "run-b",
    });
    releaseFirst();
    expect(getActiveThreadRun("t3")?.runId).toBe("run-b");
  });
});
