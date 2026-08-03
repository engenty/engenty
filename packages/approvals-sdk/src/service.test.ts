import { describe, expect, it } from "vitest";
import { createApprovalService } from "./service.js";
import { createFakeApprovalDb } from "./test-fixtures.js";

const TENANT = "tenant-a";

const REQUEST = {
  actorId: "agent-a",
  moduleId: "contacts",
  operationId: "contacts.delete",
  reason: "bulk delete",
  tenantId: TENANT,
};

describe("createApprovalService", () => {
  it("bounds once and session grants but leaves a policy grant standing", async () => {
    const db = createFakeApprovalDb();
    const service = createApprovalService(db.client);

    for (const decision of [
      "allow_once",
      "allow_session",
      "allow_policy",
    ] as const) {
      const req = await service.request(REQUEST);
      await service.decide({
        decidedBy: "user-1",
        decision,
        requestId: req.id,
        sessionId: "sess-1",
        tenantId: TENANT,
      });
    }

    const byScope = Object.fromEntries(
      db.tables.approval_grants.map((row) => [row.scope, row.expires_at])
    );
    // A durable store has no process death to clean up after it, so anything
    // that is not standing authorization has to carry its own end.
    expect(byScope.once).toBeTruthy();
    expect(byScope.session).toBeTruthy();
    expect(byScope.policy).toBeNull();
  });

  it("binds a session grant to the deciding session", async () => {
    const db = createFakeApprovalDb();
    const service = createApprovalService(db.client);
    const req = await service.request(REQUEST);
    await service.decide({
      decidedBy: "user-1",
      decision: "allow_session",
      requestId: req.id,
      sessionId: "sess-1",
      tenantId: TENANT,
    });

    expect(
      await service.consumeGrant({
        actorId: "agent-a",
        moduleId: "contacts",
        operationId: "contacts.delete",
        sessionId: "sess-2",
        tenantId: TENANT,
      })
    ).toBe(false);
    expect(
      await service.consumeGrant({
        actorId: "agent-a",
        moduleId: "contacts",
        operationId: "contacts.delete",
        sessionId: "sess-1",
        tenantId: TENANT,
      })
    ).toBe(true);
  });

  it("writes no grant when the decision is deny", async () => {
    const db = createFakeApprovalDb();
    const service = createApprovalService(db.client);
    const req = await service.request(REQUEST);
    const decided = await service.decide({
      decidedBy: "user-1",
      decision: "deny",
      requestId: req.id,
      tenantId: TENANT,
    });
    expect(decided?.status).toBe("denied");
    expect(db.tables.approval_grants).toHaveLength(0);
  });

  it("returns the live pending request instead of stacking a duplicate", async () => {
    const db = createFakeApprovalDb();
    const service = createApprovalService(db.client);
    const first = await service.request(REQUEST);
    // A blocked caller retries; the queue must not grow a row per attempt.
    const second = await service.request(REQUEST);
    expect(second.id).toBe(first.id);
    expect(db.tables.approval_requests).toHaveLength(1);
  });

  it("reports a request past its TTL as expired", async () => {
    const db = createFakeApprovalDb();
    const service = createApprovalService(db.client, -1);
    const req = await service.request(REQUEST);
    expect((await service.get(req.id))?.status).toBe("expired");
  });
});
