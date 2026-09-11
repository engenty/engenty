import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliverToLiveTaskRun,
  liveTaskRunId,
  registerLiveTaskRun,
  resetLiveTaskRunsForTests,
} from "../live-task-run-registry.js";

const taskId = "task-1";

beforeEach(() => {
  resetLiveTaskRunsForTests();
});

describe("live task-run registry", () => {
  it("hands a comment to the run executing the task", async () => {
    const deliver = vi.fn(async () => {});
    registerLiveTaskRun({ deliver, runId: "run-1", taskId });
    await expect(
      deliverToLiveTaskRun(taskId, "use the other address")
    ).resolves.toBe(true);
    expect(deliver).toHaveBeenCalledWith("use the other address");
  });

  it("answers false when nothing is running the task here", async () => {
    await expect(deliverToLiveTaskRun(taskId, "hello")).resolves.toBe(false);
  });

  it("answers false — not throws — when the loop rejects it", async () => {
    // The comment is already saved. A failed delivery must degrade to "the next
    // dispatch will carry it", never to a failed comment.
    registerLiveTaskRun({
      deliver: async () => {
        throw new Error("session closed");
      },
      runId: "run-1",
      taskId,
    });
    await expect(deliverToLiveTaskRun(taskId, "hello")).resolves.toBe(false);
  });

  it("stops accepting once the run releases", async () => {
    const deliver = vi.fn(async () => {});
    const release = registerLiveTaskRun({ deliver, runId: "run-1", taskId });
    release();
    await expect(deliverToLiveTaskRun(taskId, "hello")).resolves.toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("a late teardown does not unregister the run that replaced it", async () => {
    // Registration is keyed by task, so a second run for the same task can
    // register before the first one's `finally` has run.
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const releaseFirst = registerLiveTaskRun({
      deliver: first,
      runId: "run-1",
      taskId,
    });
    registerLiveTaskRun({ deliver: second, runId: "run-2", taskId });
    releaseFirst();
    expect(liveTaskRunId(taskId)).toBe("run-2");
    await expect(deliverToLiveTaskRun(taskId, "hello")).resolves.toBe(true);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
