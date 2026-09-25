import { describe, expect, it } from "vitest";
import { recordModuleAuditEvent } from "./audit-service.js";

describe("audit-service", () => {
  it("recordModuleAuditEvent sets source_kind=module and source_module_id", () => {
    const pushed: unknown[] = [];
    const adapter = { push: (e: unknown) => pushed.push(e) };

    recordModuleAuditEvent(
      adapter as never,
      "invoices",
      {
        type: "operation.executed",
        actorId: "u1",
        tenantId: "t1",
        operationId: "invoices_create",
      },
      { component: "plugin-http" },
      {
        operationId: "invoices_create",
        riskLevel: "medium",
        requiredCapabilities: ["module.invoices.write"],
      }
    );

    expect(pushed).toHaveLength(1);
    const event = pushed[0] as Record<string, unknown>;
    expect(event.source_kind).toBe("module");
    expect(event.source_module_id).toBe("invoices");
  });
});
