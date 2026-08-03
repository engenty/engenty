import { describe, expect, it } from "vitest";

import {
  consumeApprovalGrant,
  decideApprovalRequest,
  insertApprovalGrant,
  insertApprovalRequest,
  listGrantOperationIdsForSubjects,
  listGrantsForSubject,
  listPendingApprovalRequests,
  revokeApprovalGrant,
  revokeApprovalGrantsForSubject,
} from "./store.js";
import { createFakeApprovalDb } from "./test-fixtures.js";

const TENANT = "tenant-a";
const NOW = "2026-08-03T12:00:00.000Z";
const LATER = "2026-08-03T13:00:00.000Z";

function grant(overrides: Record<string, unknown> = {}) {
  return {
    actor_id: "agent-a",
    created_at: NOW,
    expires_at: null,
    granted_by: null,
    id: `g-${Math.abs(JSON.stringify(overrides).length)}`,
    module_id: "contacts",
    operation_id: "contacts.delete",
    request_id: null,
    scope: "policy",
    subject_id: null,
    tenant_id: TENANT,
    ...overrides,
  };
}

const CALL = {
  actorId: "agent-a",
  moduleId: "contacts",
  operationId: "contacts.delete",
  tenantId: TENANT,
};

describe("consumeApprovalGrant", () => {
  it("consumes a once grant and does not honour it twice", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [grant({ id: "g1", scope: "once" })],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(true);
    expect(db.tables.approval_grants).toHaveLength(0);
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(false);
  });

  it("keeps a policy grant standing across calls", async () => {
    const db = createFakeApprovalDb({ approval_grants: [grant({ id: "g1" })] });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(true);
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(true);
    expect(db.tables.approval_grants).toHaveLength(1);
  });

  it("matches a session grant only from its own session", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "session", subject_id: "sess-1" }),
      ],
    });
    expect(
      await consumeApprovalGrant(db.client, { ...CALL, sessionId: "sess-2" })
    ).toBe(false);
    expect(
      await consumeApprovalGrant(db.client, { ...CALL, sessionId: "sess-1" })
    ).toBe(true);
  });

  it("ignores an expired grant", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [grant({ id: "g1", expires_at: NOW })],
    });
    expect(await consumeApprovalGrant(db.client, { ...CALL, now: LATER })).toBe(
      false
    );
  });

  it("does not let an unscoped call inherit a task-bound grant", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "task", subject_id: "task-9" }),
      ],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(false);
    expect(
      await consumeApprovalGrant(db.client, { ...CALL, subjectIds: ["task-9"] })
    ).toBe(true);
  });

  it("lets any actor doing the task's work spend an actor-agnostic grant", async () => {
    // Task approvals are decided before the retry's principal exists, so the
    // grant names the WORK (subject), not the worker.
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({
          actor_id: null,
          id: "g1",
          scope: "task",
          subject_id: "task-9",
        }),
      ],
    });
    expect(
      await consumeApprovalGrant(db.client, {
        ...CALL,
        actorId: "some-freshly-minted-principal",
        subjectIds: ["task-9"],
      })
    ).toBe(true);
    // ...but only within that subject's work.
    expect(
      await consumeApprovalGrant(db.client, {
        ...CALL,
        actorId: "some-freshly-minted-principal",
      })
    ).toBe(false);
  });

  it("binds a subject-bound once grant to its subject", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({
          actor_id: null,
          id: "g1",
          scope: "once",
          subject_id: "task-9",
        }),
      ],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(false);
    expect(
      await consumeApprovalGrant(db.client, { ...CALL, subjectIds: ["task-9"] })
    ).toBe(true);
    // once + subject still burns on use.
    expect(
      await consumeApprovalGrant(db.client, { ...CALL, subjectIds: ["task-9"] })
    ).toBe(false);
  });

  it("matches a module-agnostic grant under whichever module owns the operation", async () => {
    // Task-UI approvals name only the operation; operation ids are globally
    // unique, so the module axis adds provenance, not precision.
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({
          actor_id: null,
          id: "g1",
          module_id: null,
          scope: "task",
          subject_id: "task-9",
        }),
      ],
    });
    expect(
      await consumeApprovalGrant(db.client, {
        ...CALL,
        moduleId: "connections-google",
        operationId: "contacts.delete",
        subjectIds: ["task-9"],
      })
    ).toBe(true);
    // A module-PINNED grant still refuses other modules' operations.
    db.tables.approval_grants.push(
      grant({ id: "g2", scope: "task", subject_id: "task-9" })
    );
    expect(
      await consumeApprovalGrant(db.client, {
        ...CALL,
        moduleId: "some-other-module",
        subjectIds: ["task-9"],
      })
    ).toBe(true); // g1 (module-agnostic) still matches
    db.tables.approval_grants.splice(0, 1); // drop g1, leave only pinned g2
    expect(
      await consumeApprovalGrant(db.client, {
        ...CALL,
        moduleId: "some-other-module",
        subjectIds: ["task-9"],
      })
    ).toBe(false);
  });

  it("never honors an actor-free subject-free row, and refuses to mint one", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [grant({ actor_id: null, id: "g1", subject_id: null })],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(false);
    await expect(
      insertApprovalGrant(db.client, {
        actorId: null,
        moduleId: "contacts",
        operationId: "contacts.delete",
        scope: "policy",
        tenantId: TENANT,
      })
    ).rejects.toThrow(/bound to a subject/);
  });

  it("does not cross tenants", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [grant({ id: "g1", tenant_id: "tenant-b" })],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(false);
  });

  it("burns the once grant before a standing one", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "once" }),
        grant({ id: "g2" }),
      ],
    });
    expect(await consumeApprovalGrant(db.client, CALL)).toBe(true);
    expect(db.tables.approval_grants.map((r) => r.id)).toEqual(["g2"]);
  });
});

describe("approval requests", () => {
  it("lists only this tenant's pending requests, and all of them for null", async () => {
    const db = createFakeApprovalDb();
    for (const tenantId of [TENANT, "tenant-b"]) {
      await insertApprovalRequest(db.client, {
        actorId: "agent-a",
        expiresAt: LATER,
        moduleId: "contacts",
        operationId: "contacts.delete",
        reason: "bulk delete",
        tenantId,
      });
    }
    const mine = await listPendingApprovalRequests(db.client, TENANT, NOW);
    expect(mine.map((r) => r.tenant_id)).toEqual([TENANT]);
    const all = await listPendingApprovalRequests(db.client, null, NOW);
    expect(all).toHaveLength(2);
  });

  it("hides a request whose TTL has passed", async () => {
    const db = createFakeApprovalDb();
    await insertApprovalRequest(db.client, {
      actorId: "agent-a",
      expiresAt: NOW,
      moduleId: "contacts",
      operationId: "contacts.delete",
      reason: "bulk delete",
      tenantId: TENANT,
    });
    expect(await listPendingApprovalRequests(db.client, TENANT, LATER)).toEqual(
      []
    );
  });

  it("lets only the first of two racing approvers decide", async () => {
    const db = createFakeApprovalDb();
    const req = await insertApprovalRequest(db.client, {
      actorId: "agent-a",
      expiresAt: LATER,
      moduleId: "contacts",
      operationId: "contacts.delete",
      reason: "bulk delete",
      tenantId: TENANT,
    });
    const input = {
      decidedAt: NOW,
      decidedBy: "user-1",
      decision: "allow_once" as const,
      id: req.id,
      tenantId: TENANT,
    };
    expect(await decideApprovalRequest(db.client, input)).not.toBeNull();
    // Second approver finds nothing still pending — no duplicate grant.
    expect(
      await decideApprovalRequest(db.client, { ...input, decidedBy: "user-2" })
    ).toBeNull();
  });

  it("will not decide another tenant's request", async () => {
    const db = createFakeApprovalDb();
    const req = await insertApprovalRequest(db.client, {
      actorId: "agent-a",
      expiresAt: LATER,
      moduleId: "contacts",
      operationId: "contacts.delete",
      reason: "bulk delete",
      tenantId: TENANT,
    });
    expect(
      await decideApprovalRequest(db.client, {
        decidedAt: NOW,
        decidedBy: "user-1",
        decision: "allow_once",
        id: req.id,
        tenantId: "tenant-b",
      })
    ).toBeNull();
  });
});

describe("listGrantOperationIdsForSubjects", () => {
  it("returns unexpired operation ids for the named subjects, deduped", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "task", subject_id: "task-9" }),
        grant({
          id: "g2",
          operation_id: "gmail_send",
          scope: "once",
          subject_id: "task-9",
        }),
        // Duplicate op via the trigger subject — deduped.
        grant({
          id: "g3",
          operation_id: "gmail_send",
          scope: "trigger",
          subject_id: "trig-1",
        }),
        // Expired — excluded.
        grant({
          expires_at: NOW,
          id: "g4",
          operation_id: "expired_op",
          scope: "once",
          subject_id: "task-9",
        }),
        // Other subject — excluded.
        grant({
          id: "g5",
          operation_id: "other_op",
          scope: "task",
          subject_id: "task-8",
        }),
      ],
    });
    const ops = await listGrantOperationIdsForSubjects(db.client, {
      now: LATER,
      subjectIds: ["task-9", "trig-1"],
      tenantId: TENANT,
    });
    expect(ops.sort()).toEqual(["contacts.delete", "gmail_send"]);
    expect(
      await listGrantOperationIdsForSubjects(db.client, {
        subjectIds: [],
        tenantId: TENANT,
      })
    ).toEqual([]);
  });
});

describe("listGrantsForSubject", () => {
  it("returns unexpired grants with scopes for one subject", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "task", subject_id: "task-9" }),
        grant({
          id: "g2",
          operation_id: "gmail_send",
          scope: "once",
          subject_id: "task-9",
        }),
        // Expired — excluded.
        grant({
          expires_at: NOW,
          id: "g3",
          operation_id: "expired_op",
          scope: "once",
          subject_id: "task-9",
        }),
        // Other subject — excluded.
        grant({ id: "g4", scope: "task", subject_id: "task-8" }),
      ],
    });
    const rows = await listGrantsForSubject(db.client, {
      now: LATER,
      subjectId: "task-9",
      tenantId: TENANT,
    });
    expect(rows.sort((a, b) => a.scope.localeCompare(b.scope))).toEqual([
      { operation_id: "gmail_send", scope: "once" },
      { operation_id: "contacts.delete", scope: "task" },
    ]);
  });
});

describe("revokeApprovalGrant", () => {
  it("drops every scope of that operation on the subject, nothing else", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "task", subject_id: "task-9" }),
        grant({ id: "g2", scope: "once", subject_id: "task-9" }),
        grant({
          id: "g3",
          operation_id: "gmail_send",
          scope: "task",
          subject_id: "task-9",
        }),
        grant({ id: "g4", scope: "task", subject_id: "task-8" }),
      ],
    });
    await revokeApprovalGrant(db.client, {
      operationId: "contacts.delete",
      subjectId: "task-9",
      tenantId: TENANT,
    });
    expect(db.tables.approval_grants.map((r) => r.id)).toEqual(["g3", "g4"]);
  });
});

describe("revokeApprovalGrantsForSubject", () => {
  it("drops that subject's grants and leaves the rest", async () => {
    const db = createFakeApprovalDb({
      approval_grants: [
        grant({ id: "g1", scope: "session", subject_id: "sess-1" }),
        grant({ id: "g2", scope: "session", subject_id: "sess-2" }),
        grant({ id: "g3" }),
      ],
    });
    await revokeApprovalGrantsForSubject(db.client, {
      scope: "session",
      subjectId: "sess-1",
      tenantId: TENANT,
    });
    expect(db.tables.approval_grants.map((r) => r.id)).toEqual(["g2", "g3"]);
  });
});

describe("insertApprovalGrant", () => {
  it("stores the scope and subject the decision implied", async () => {
    const db = createFakeApprovalDb();
    const row = await insertApprovalGrant(db.client, {
      actorId: "agent-a",
      moduleId: "contacts",
      operationId: "contacts.delete",
      scope: "session",
      subjectId: "sess-1",
      tenantId: TENANT,
    });
    expect(row.scope).toBe("session");
    expect(row.subject_id).toBe("sess-1");
  });
});
