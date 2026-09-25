import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { describe, expect, it } from "vitest";
import { fileApprovalRequest } from "./approval-gate.js";
import type { SecurityAuditLogAdapter } from "./audit-adapter.js";
import type { PrincipalContext } from "./auth.js";

const TENANT = "tenant-a";
const OPERATION = { moduleId: "contacts", operationId: "contacts.delete" };
const REASON = "high risk";

const AUTH = {
  audience: [],
  authMethod: "user_token",
  capabilities: [],
  delegationChain: [],
  principalId: "agent-a",
  sessionId: "sess-1",
  tenantId: TENANT,
} as unknown as PrincipalContext;

function harness() {
  const db = createFakeApprovalDb();
  const events: Record<string, unknown>[] = [];
  const auditLog = {
    push: (event: Record<string, unknown>) => {
      events.push(event);
    },
  } as unknown as SecurityAuditLogAdapter;
  const approvalService = createApprovalService(db.client);

  return {
    db,
    events,
    file: () =>
      fileApprovalRequest({
        approvalService,
        auditLog,
        auth: AUTH,
        reason: REASON,
        ...OPERATION,
      }),
  };
}

describe("fileApprovalRequest", () => {
  it("opens a request and reports when it expires", async () => {
    const h = harness();
    const result = await h.file();

    expect(result).toMatchObject({ reason: REASON });
    expect(result.expiresAt).toBeTruthy();
    expect(h.db.tables.approval_requests).toHaveLength(1);
  });

  it("records both why it stopped and what a human now owns", async () => {
    const h = harness();
    await h.file();

    expect(h.events.map((e) => e.type)).toEqual([
      "policy.require_approval",
      "approval.created",
    ]);
  });
});
