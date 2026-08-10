import { describe, expect, it } from "vitest";
import {
  buildExecutedAuditDetail,
  isInfraNoiseOperation,
  shouldRecordAudit,
} from "./audit-relevance.js";

describe("shouldRecordAudit", () => {
  it("never records policy.allow", () => {
    expect(
      shouldRecordAudit({
        type: "policy.allow",
        operationId: "tasks_update",
        riskLevel: "high",
      })
    ).toBe(false);
  });

  it("always records denials, approvals, and auth", () => {
    expect(shouldRecordAudit({ type: "policy.deny" })).toBe(true);
    expect(shouldRecordAudit({ type: "capability.deny" })).toBe(true);
    expect(shouldRecordAudit({ type: "operation.rejected" })).toBe(true);
    expect(shouldRecordAudit({ type: "policy.require_approval" })).toBe(true);
    expect(shouldRecordAudit({ type: "approval.created" })).toBe(true);
    expect(shouldRecordAudit({ type: "auth.login_completed" })).toBe(true);
  });

  it("always records domain (non-framework) events", () => {
    expect(
      shouldRecordAudit({
        type: "tasks.checked_out",
        operationId: "tasks_checkout",
      })
    ).toBe(true);
  });

  it("skips heartbeats and bridge claim polls", () => {
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId:
          "connections-local-files.http.post./api/local-files/heartbeat",
        method: "POST",
        riskLevel: "medium",
      })
    ).toBe(false);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        path: "/api/local-files/bridge/claim",
        method: "POST",
        riskLevel: "medium",
      })
    ).toBe(false);
  });

  it("honors audit:never and audit:always", () => {
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "tasks_update",
        riskLevel: "high",
        audit: "never",
      })
    ).toBe(false);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "memory_record_search",
        riskLevel: "low",
        audit: "always",
      })
    ).toBe(true);
  });

  it("records high-risk and write mutations", () => {
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "tasks_update",
        riskLevel: "high",
      })
    ).toBe(true);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "connections_disconnect",
        riskLevel: "medium",
        requiredCapabilities: ["module.connections.write"],
      })
    ).toBe(true);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "plugin.http.post./api/things",
        method: "POST",
        path: "/api/things",
        riskLevel: "medium",
      })
    ).toBe(true);
  });

  it("skips low-risk reads and search-like gateway ops", () => {
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "memory_record_search",
        riskLevel: "medium",
      })
    ).toBe(false);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "tasks_get",
        riskLevel: "low",
      })
    ).toBe(false);
    expect(
      shouldRecordAudit({
        type: "operation.executed",
        operationId: "tenant-settings.http.get./api/tenant-settings/:name",
        method: "GET",
        riskLevel: "medium",
      })
    ).toBe(false);
  });
});

describe("isInfraNoiseOperation", () => {
  it("detects heartbeat and bridge claim", () => {
    expect(isInfraNoiseOperation("x.http.post./api/foo/heartbeat")).toBe(true);
    expect(isInfraNoiseOperation(null, "/api/local-files/bridge/claim")).toBe(
      true
    );
    expect(isInfraNoiseOperation("tasks_update")).toBe(false);
  });
});

describe("buildExecutedAuditDetail", () => {
  it("omits empty fields", () => {
    expect(
      buildExecutedAuditDetail({
        transport: "http",
        riskLevel: "medium",
        principalType: "user",
      })
    ).toEqual({
      transport: "http",
      riskLevel: "medium",
      principalType: "user",
    });
    expect(buildExecutedAuditDetail({ agentId: "a1" })).toEqual({
      agentId: "a1",
    });
  });
});
