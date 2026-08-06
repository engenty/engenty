import { describe, expect, it, vi } from "vitest";

import type { AgentRunStore } from "../../dal/threads/agent-run-store.js";
import {
  createSessionRunTracker,
  ensureAgentRunStarted,
} from "./run-tracking.js";

const runInput = {
  id: "22222222-2222-4222-8222-222222222222",
  tenantId: "00000000-0000-4000-8000-000000000001",
  threadId: "33333333-3333-4333-8333-333333333333",
  agentId: "tasks.assist",
  modelId: null,
  createdByUserId: "44444444-4444-4444-8444-444444444444",
};

describe("ensureAgentRunStarted", () => {
  it("creates a run row when none exists", async () => {
    const createRun = vi.fn(async () => ({ run: {} }));
    const runStore = {
      getRun: vi.fn(async () => null),
      createRun,
    } as unknown as AgentRunStore;

    await ensureAgentRunStarted(runStore, runInput);

    expect(createRun).toHaveBeenCalledWith(runInput);
  });

  it("skips insert when the run row already exists", async () => {
    const createRun = vi.fn(async () => ({ run: {} }));
    const runStore = {
      getRun: vi.fn(async () => ({ id: runInput.id })),
      createRun,
    } as unknown as AgentRunStore;

    await ensureAgentRunStarted(runStore, runInput);

    expect(createRun).not.toHaveBeenCalled();
  });

  it("no-ops when run store is unavailable", async () => {
    await expect(
      ensureAgentRunStarted(null, runInput)
    ).resolves.toBeUndefined();
  });
});

describe("createSessionRunTracker", () => {
  it("ensures run row exists before appending events", async () => {
    const createRun = vi.fn(async () => ({ run: {} }));
    const appendRunEvent = vi.fn(async () => undefined);
    const runStore = {
      getRun: vi.fn(async () => null),
      createRun,
      appendRunEvent,
    } as unknown as AgentRunStore;

    const tracker = createSessionRunTracker({
      agentId: runInput.agentId,
      createdByUserId: runInput.createdByUserId,
      modelId: null,
      runId: runInput.id,
      runStore,
      threadId: runInput.threadId,
      tenantId: runInput.tenantId,
    });

    await tracker.append({
      type: "RUN_STARTED",
      runId: runInput.id,
      threadId: runInput.threadId,
    });

    expect(createRun).toHaveBeenCalled();
    expect(appendRunEvent).toHaveBeenCalled();
  });

  it("ensures run row exists before completing run", async () => {
    const createRun = vi.fn(async () => ({ run: {} }));
    const finishRun = vi.fn(async () => undefined);
    const runStore = {
      getRun: vi.fn(async () => null),
      createRun,
      finishRun,
    } as unknown as AgentRunStore;

    const tracker = createSessionRunTracker({
      agentId: runInput.agentId,
      createdByUserId: runInput.createdByUserId,
      modelId: null,
      runId: runInput.id,
      runStore,
      threadId: runInput.threadId,
      tenantId: runInput.tenantId,
    });

    await tracker.complete({ status: "completed" });

    expect(createRun).toHaveBeenCalled();
    expect(finishRun).toHaveBeenCalled();
  });
});
