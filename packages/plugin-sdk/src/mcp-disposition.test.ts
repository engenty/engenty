import { describe, expect, it } from "vitest";
import {
  inferMcpDisposition,
  isMcpDisposition,
  resolveMcpDisposition,
} from "./mcp-disposition.js";

describe("inferMcpDisposition", () => {
  it("excludes credential and impersonation operations", () => {
    expect(inferMcpDisposition({ operationId: "core_impersonate_user" })).toBe(
      "never"
    );
    expect(inferMcpDisposition({ operationId: "auth_mint_token" })).toBe(
      "never"
    );
  });

  it("requires an explicit grant for writes and high-risk work", () => {
    expect(
      inferMcpDisposition({
        idempotent: false,
        operationId: "contacts_update",
        riskLevel: "medium",
      })
    ).toBe("explicit_grant");
    expect(
      inferMcpDisposition({
        operationId: "invoices_void",
        riskLevel: "high",
      })
    ).toBe("explicit_grant");
  });

  it("defaults low-risk idempotent reads to catalog-eligible", () => {
    expect(
      inferMcpDisposition({
        idempotent: true,
        operationId: "contacts_list",
        riskLevel: "low",
      })
    ).toBe("default");
  });
});

describe("resolveMcpDisposition", () => {
  it("prefers an explicit declaration", () => {
    expect(
      resolveMcpDisposition({
        mcpDisposition: "never",
        operationId: "contacts_list",
        riskLevel: "low",
        idempotent: true,
      })
    ).toEqual({ declared: true, disposition: "never" });
  });

  it("records inferred dispositions as undeclared", () => {
    expect(
      resolveMcpDisposition({
        operationId: "contacts_list",
        riskLevel: "low",
        idempotent: true,
      })
    ).toEqual({ declared: false, disposition: "default" });
  });

  it("rejects unknown disposition strings", () => {
    expect(isMcpDisposition("sometimes")).toBe(false);
    expect(isMcpDisposition("default")).toBe(true);
  });
});
