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

describe("isOpenInterruptOrphaned", () => {
  it("is orphaned when a run_id interrupt has no live/in-flight/parked session", () => {
    expect(isOpenInterruptOrphaned(openInterrupt() as never)).toBe(true);
  });

  it("is NOT orphaned while the suspended run is still parked", () => {
    parkSessionRun("run-R", {
      controller: { destroy: vi.fn(async () => {}) } as never,
      mergedDefinitions: [],
      session: { suspensions: { has: () => true } } as never,
      threadId: "thread-1",
    });
    try {
      expect(isOpenInterruptOrphaned(openInterrupt() as never)).toBe(false);
    } finally {
      takeParkedSessionRun("run-R");
      finishParkedResume("run-R");
    }
  });

  it("is NOT orphaned while the run is live in-process", () => {
    markRunLive("run-R");
    try {
      expect(isOpenInterruptOrphaned(openInterrupt() as never)).toBe(false);
    } finally {
      markRunDone("run-R");
    }
  });

  it("is NOT orphaned for an artifact interrupt (no run_id) until it expires", () => {
    expect(
      isOpenInterruptOrphaned(openInterrupt({ run_id: undefined }) as never)
    ).toBe(false);
    expect(
      isOpenInterruptOrphaned(
        openInterrupt({ run_id: undefined, expires_at: PAST }) as never
      )
    ).toBe(true);
  });
});

describe("reconcileOrphanedInterrupt", () => {
  let store: {
    listMessagesOrdered: ReturnType<typeof vi.fn>;
    updateMessageParts: ReturnType<typeof vi.fn>;
    updateSessionForUser: ReturnType<typeof vi.fn>;
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
      updateMessageParts: vi.fn(async () => ({ message: null })),
      updateSessionForUser: vi.fn(async () => ({
        session: { metadata: {} },
      })),
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
      expect(store.updateSessionForUser).not.toHaveBeenCalled();
      expect(store.updateMessageParts).not.toHaveBeenCalled();
    } finally {
      takeParkedSessionRun("run-R");
      finishParkedResume("run-R");
    }
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
    expect(store.updateSessionForUser).not.toHaveBeenCalled();
  });
});
