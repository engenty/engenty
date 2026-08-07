import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishParkedResume,
  parkSessionRun,
  takeParkedSessionRun,
} from "../../conversation/session-park.js";
import {
  isOpenInterruptOrphaned,
  reconcileOrphanedInterrupt,
} from "../reconcile-orphaned-interrupt.js";
import { markRunDone, markRunLive } from "../run-event-bus.js";

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function openInterrupt(overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: "tool-approval|op_a",
    expires_at: FUTURE,
    interrupt_id: "tool-approval|op_a",
    kind: "decision",
    run_id: "run-R",
    title: "Approve tasks_create?",
    tool_call_id: "call-a",
    ...overrides,
  };
}

function metadataWith(open: Record<string, unknown> | null) {
  return open ? { [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: open } : {};
}

const scope = {
  tenantId: "t1",
  userId: "u1",
} as never;

/**
 * A probe standing in for Mastra's storage: `suspendedRunIds` is what
 * `agent.listSuspendedRuns({ threadId })` would return after a restart.
 */
function snapshotProbe(suspendedRunIds: string[]) {
  const listSuspendedRuns = vi.fn(async () => ({
    runs: suspendedRunIds.map((runId) => ({ runId })),
    total: suspendedRunIds.length,
  }));
  const assembleAgent = vi.fn(async () => ({ listSuspendedRuns }));
  return {
    assembleAgent,
    listSuspendedRuns,
    probe: () =>
      ({
        agentId: "engenty.copilot",
        assembleAgent,
        mastra: {} as never,
        registry: {} as never,
        tenantId: "t1",
        threadId: "thread-1",
        userId: "u1",
      }) as never,
  };
}

describe("isOpenInterruptOrphaned", () => {
  it("is orphaned when a run_id interrupt has no live/in-flight/parked session", async () => {
    expect(await isOpenInterruptOrphaned(openInterrupt() as never)).toBe(true);
  });

  it("is NOT orphaned while the suspended run is still parked", async () => {
    parkSessionRun("run-R", {
      controller: { destroy: vi.fn(async () => {}) } as never,
      mergedDefinitions: [],
      session: { suspensions: { has: () => true } } as never,
      threadId: "thread-1",
    });
    try {
      expect(await isOpenInterruptOrphaned(openInterrupt() as never)).toBe(
        false
      );
    } finally {
      takeParkedSessionRun("run-R");
      finishParkedResume("run-R");
    }
  });

  it("is NOT orphaned while the run is live in-process", async () => {
    markRunLive("run-R");
    try {
      expect(await isOpenInterruptOrphaned(openInterrupt() as never)).toBe(
        false
      );
    } finally {
      markRunDone("run-R");
    }
  });

  it("is NOT orphaned for an artifact interrupt (no run_id) until it expires", async () => {
    expect(
      await isOpenInterruptOrphaned(
        openInterrupt({ run_id: undefined }) as never
      )
    ).toBe(false);
    expect(
      await isOpenInterruptOrphaned(
        openInterrupt({ run_id: undefined, expires_at: PAST }) as never
      )
    ).toBe(true);
  });

  // THE regression: after a restart every in-process check necessarily misses,
  // which is exactly when the snapshot lane can still resume the run.
  it("is NOT orphaned when storage still holds the suspended run", async () => {
    const { probe, listSuspendedRuns } = snapshotProbe(["run-R"]);
    expect(await isOpenInterruptOrphaned(openInterrupt() as never, probe)).toBe(
      false
    );
    expect(listSuspendedRuns).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("IS orphaned when storage holds a different run", async () => {
    const { probe } = snapshotProbe(["some-other-run"]);
    expect(await isOpenInterruptOrphaned(openInterrupt() as never, probe)).toBe(
      true
    );
  });

  it("keeps expiry eager — an expired interrupt is orphaned even with a snapshot", async () => {
    const { probe, assembleAgent } = snapshotProbe(["run-R"]);
    expect(
      await isOpenInterruptOrphaned(
        openInterrupt({ expires_at: PAST }) as never,
        probe
      )
    ).toBe(true);
    // Expiry short-circuits before storage is ever touched.
    expect(assembleAgent).not.toHaveBeenCalled();
  });

  it("never touches storage while the run is still live in-process", async () => {
    const { probe, assembleAgent } = snapshotProbe(["run-R"]);
    markRunLive("run-R");
    try {
      expect(
        await isOpenInterruptOrphaned(openInterrupt() as never, probe)
      ).toBe(false);
      expect(assembleAgent).not.toHaveBeenCalled();
    } finally {
      markRunDone("run-R");
    }
  });

  it("falls back to orphaned when the storage probe throws", async () => {
    const probe = (() => ({
      agentId: "engenty.copilot",
      assembleAgent: vi.fn(async () => {
        throw new Error("storage down");
      }),
      mastra: {} as never,
      registry: {} as never,
      tenantId: "t1",
      threadId: "thread-1",
      userId: "u1",
    })) as never;
    expect(await isOpenInterruptOrphaned(openInterrupt() as never, probe)).toBe(
      true
    );
  });
});

describe("reconcileOrphanedInterrupt", () => {
  let store: {
    listMessagesOrdered: ReturnType<typeof vi.fn>;
    mergeThreadMetadataForUser: ReturnType<typeof vi.fn>;
    updateMessageParts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    store = {
      listMessagesOrdered: vi.fn(async () => [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: { state: "call", toolCallId: "call-a" },
            },
            {
              type: "tool-invocation",
              toolInvocation: { state: "call", toolCallId: "call-b" },
            },
          ],
        },
      ]),
      mergeThreadMetadataForUser: vi.fn(async () => ({
        thread: { metadata: {} },
      })),
      updateMessageParts: vi.fn(async () => ({ message: null })),
    };
  });

  it("clears an orphaned interrupt and resolves the dangling tool steps", async () => {
    const result = await reconcileOrphanedInterrupt({
      metadata: metadataWith(openInterrupt()),
      scope,
      store: store as never,
      threadId: "thread-1",
      userId: "u1",
    });

    expect(result).not.toBeNull();
    // Interrupt cleared from metadata.
    expect(result?.[AG_UI_OPEN_INTERRUPT_METADATA_KEY]).toBeUndefined();
    // Both parallel dangling tool calls in the wedged turn resolved to "result".
    expect(store.updateMessageParts).toHaveBeenCalledTimes(1);
    const parts = store.updateMessageParts.mock.calls[0]![0].parts as Array<{
      toolInvocation: { state: string; result?: { interrupted?: boolean } };
    }>;
    expect(parts.every((p) => p.toolInvocation.state === "result")).toBe(true);
    expect(parts[0]!.toolInvocation.result?.interrupted).toBe(true);
  });

  it("no-ops when the interrupt is still resumable (parked)", async () => {
    parkSessionRun("run-R", {
      controller: { destroy: vi.fn(async () => {}) } as never,
      mergedDefinitions: [],
      session: { suspensions: { has: () => true } } as never,
      threadId: "thread-1",
    });
    try {
      const result = await reconcileOrphanedInterrupt({
        metadata: metadataWith(openInterrupt()),
        scope,
        store: store as never,
        threadId: "thread-1",
        userId: "u1",
      });
      expect(result).toBeNull();
      expect(store.mergeThreadMetadataForUser).not.toHaveBeenCalled();
      expect(store.updateMessageParts).not.toHaveBeenCalled();
    } finally {
      takeParkedSessionRun("run-R");
      finishParkedResume("run-R");
    }
  });

  // The bug this whole change exists for: a restart leaves the park empty, and
  // the reconciler used to clear the interrupt on thread load — before the
  // resume POST could reach the snapshot lane, so the run was unresumable and
  // the route answered "no runtime matched this run".
  it("no-ops when the park is gone but storage still holds the run", async () => {
    const { probe, listSuspendedRuns } = snapshotProbe(["run-R"]);
    const result = await reconcileOrphanedInterrupt({
      metadata: metadataWith(openInterrupt()),
      probe,
      scope,
      store: store as never,
      threadId: "thread-1",
      userId: "u1",
    });
    expect(result).toBeNull();
    expect(listSuspendedRuns).toHaveBeenCalled();
    // The interrupt and its dangling tool steps are left intact for the resume.
    expect(store.mergeThreadMetadataForUser).not.toHaveBeenCalled();
    expect(store.updateMessageParts).not.toHaveBeenCalled();
  });

  it("still heals when neither the park nor storage has the run", async () => {
    const { probe } = snapshotProbe([]);
    const result = await reconcileOrphanedInterrupt({
      metadata: metadataWith(openInterrupt()),
      probe,
      scope,
      store: store as never,
      threadId: "thread-1",
      userId: "u1",
    });
    expect(result).not.toBeNull();
    expect(result?.[AG_UI_OPEN_INTERRUPT_METADATA_KEY]).toBeUndefined();
    expect(store.updateMessageParts).toHaveBeenCalledTimes(1);
  });

  it("no-ops when there is no open interrupt", async () => {
    const result = await reconcileOrphanedInterrupt({
      metadata: metadataWith(null),
      scope,
      store: store as never,
      threadId: "thread-1",
      userId: "u1",
    });
    expect(result).toBeNull();
    expect(store.mergeThreadMetadataForUser).not.toHaveBeenCalled();
  });
});
