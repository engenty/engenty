import { describe, expect, it } from "vitest";
import { shouldRecordAudit } from "./audit-relevance.js";

describe("shouldRecordAudit", () => {
  it("always records denials, approvals, and auth", () => {
    expect(shouldRecordAudit({ type: "policy.deny" })).toBe(true);
    expect(shouldRecordAudit({ type: "capability.deny" })).toBe(true);
    expect(shouldRecordAudit({ type: "operation.rejected" })).toBe(true);
    expect(shouldRecordAudit({ type: "policy.require_approval" })).toBe(true);
    expect(shouldRecordAudit({ type: "approval.created" })).toBe(true);
    expect(shouldRecordAudit({ type: "auth.login_completed" })).toBe(true);
  });

  it.each([
    {
      case: "high risk",
      input: { operationId: "tasks_update", riskLevel: "high" as const },
    },
    {
      case: "write capability",
      input: {
        operationId: "connections_disconnect",
        requiredCapabilities: ["module.connections.write"],
        riskLevel: "medium" as const,
      },
    },
    {
      case: "mutating HTTP method",
      input: {
        method: "POST",
        operationId: "plugin.http.post./api/things",
        path: "/api/things",
        riskLevel: "medium" as const,
      },
    },
    {
      case: "audit: always on a low-risk read",
      input: {
        audit: "always" as const,
        operationId: "contacts_contact_search",
        riskLevel: "low" as const,
      },
    },
  ])("records an executed operation with $case", ({ input }) => {
    expect(shouldRecordAudit({ type: "operation.executed", ...input })).toBe(
      true
    );
  });
});
