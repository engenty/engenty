import { describe, expect, it } from "vitest";
import {
  recordCoreAuditEvent,
  recordModuleAuditEvent,
} from "./audit-service.js";

describe("audit-service", () => {
  it("recordCoreAuditEvent sets source_kind=core and source_module_id=null", () => {
    const pushed: unknown[] = [];
    const adapter = {
      push: (e: unknown) => {
        pushed.push(e);
      },
    };

    recordCoreAuditEvent(adapter as never, {
      type: "auth.login_started",
      actorId: "u1",
      tenantId: "t1",
    });

    expect(pushed).toHaveLength(1);
    const event = pushed[0] as Record<string, unknown>;
    expect(event.source_kind).toBe("core");
    expect(event.source_module_id).toBeNull();
    expect(event.type).toBe("auth.login_started");
  });

  it("recordCoreAuditEvent sets source_component when provided", () => {
    const pushed: unknown[] = [];
    const adapter = { push: (e: unknown) => pushed.push(e) };

    recordCoreAuditEvent(
      adapter as never,
      { type: "auth.rate_limited", detail: {} },
      { component: "auth-routes" }
    );

    expect((pushed[0] as Record<string, unknown>).source_component).toBe(
      "auth-routes"
    );
  });

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
        operationId: "invoices_list",
      },
      { component: "plugin-http" }
    );

    expect(pushed).toHaveLength(1);
    const event = pushed[0] as Record<string, unknown>;
    expect(event.source_kind).toBe("module");
    expect(event.source_module_id).toBe("invoices");
    expect(event.moduleId).toBe("invoices");
    expect(event.source_component).toBe("plugin-http");
  });
});
