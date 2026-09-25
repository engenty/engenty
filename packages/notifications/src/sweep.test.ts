import { describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "./contracts.js";
import type { ResolveNotificationsInput } from "./service.js";
import {
  approvalOutcome,
  interruptOutcome,
  runOutcome,
  sweepStaleDecisions,
} from "./sweep.js";

const NOW = new Date("2026-09-06T12:00:00Z");

function record(
  overrides: Partial<NotificationRecord> & {
    subject_id: string;
    subject_type: string;
  }
): NotificationRecord {
  return {
    actor_id: null,
    actor_kind: null,
    audience_id: null,
    audience_kind: "tenant",
    body: null,
    class: "decision",
    coalesce_key: null,
    coalesced_count: 1,
    created_at: NOW.toISOString(),
    dedupe_key: null,
    dismissed_at: null,
    id: `n-${overrides.subject_id}`,
    kind: "approval_requested",
    metadata: null,
    payload: null,
    priority: "high",
    resolved_at: null,
    source: "connections",
    space_id: null,
    status: "pending",
    summary: "s",
    target: null,
    tenant_id: "t1",
    title_key: null,
    title_params: null,
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("subject outcomes", () => {
  it("approval requests: decided, expired by TTL, gone, or still open", () => {
    expect(
      approvalOutcome(
        { expires_at: "2026-09-13T00:00:00Z", status: "approved" },
        NOW
      )
    ).toBe("decided");
    expect(
      approvalOutcome(
        { expires_at: "2026-09-13T00:00:00Z", status: "denied" },
        NOW
      )
    ).toBe("decided");
    expect(
      approvalOutcome(
        { expires_at: "2026-09-01T00:00:00Z", status: "pending" },
        NOW
      )
    ).toBe("expired");
    expect(approvalOutcome(undefined, NOW)).toBe("expired");
    expect(
      approvalOutcome(
        { expires_at: "2026-09-13T00:00:00Z", status: "pending" },
        NOW
      )
    ).toBeNull();
  });

  it("runs: a parked run stays, a lost one expires, a moving one resumed", () => {
    expect(runOutcome({ status: "requires_action" })).toBeNull();
    expect(runOutcome({ status: "failed" })).toBe("expired");
    expect(runOutcome({ status: "running" })).toBe("resumed");
    expect(runOutcome({ status: "completed" })).toBe("completed");
    expect(runOutcome(undefined)).toBe("expired");
  });

  it("desk interrupts: held open stays, cleared is abandoned", () => {
    expect(interruptOutcome(true)).toBeNull();
    expect(interruptOutcome(false)).toBe("abandoned");
  });
});

describe("sweepStaleDecisions", () => {
  it("resolves exactly the subjects whose state says they are over", async () => {
    // The 2026-09-06 dev DB: pending question rows about runs the restart
    // reconciler failed, plus an approval request past its TTL — all counted
    // on the bell with nobody able to answer them.
    const resolve = vi.fn<
      (input: ResolveNotificationsInput) => Promise<number>
    >(async () => 1);
    const listOpenWithSubject = vi.fn(async () => [
      record({ subject_id: "run-failed", subject_type: "run" }),
      record({ subject_id: "run-parked", subject_type: "run" }),
      record({ subject_id: "req-old", subject_type: "approval_request" }),
      record({ subject_id: "req-open", subject_type: "approval_request" }),
      record({ subject_id: "task-1", subject_type: "task" }),
      record({ subject_id: "int-open", subject_type: "thread_interrupt" }),
      record({ subject_id: "int-gone", subject_type: "thread_interrupt" }),
    ]);
    const result = await sweepStaleDecisions({
      now: NOW,
      service: { resolve },
      states: {
        approvalRequests: async () =>
          new Map([
            [
              "req-old",
              { expires_at: "2026-09-01T00:00:00Z", status: "pending" },
            ],
            [
              "req-open",
              { expires_at: "2026-09-13T00:00:00Z", status: "pending" },
            ],
          ]),
        runs: async () =>
          new Map([
            ["run-failed", { status: "failed" }],
            ["run-parked", { status: "requires_action" }],
          ]),
        threadInterrupts: async () => new Set(["int-open"]),
      },
      store: { listOpenWithSubject },
      tenantId: "t1",
    });
    expect(result).toEqual({ resolved: 3, scanned: 7 });
    expect(resolve.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "expired",
          subjectId: "req-old",
          subjectType: "approval_request",
        }),
        expect.objectContaining({
          outcome: "expired",
          subjectId: "run-failed",
          subjectType: "run",
        }),
        expect.objectContaining({
          outcome: "abandoned",
          subjectId: "int-gone",
          subjectType: "thread_interrupt",
        }),
      ])
    );
    expect(resolve).toHaveBeenCalledTimes(3);
  });
});
