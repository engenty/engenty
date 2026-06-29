import { describe, expect, it, vi } from "vitest";

// Capture the module-operation invoker calls so we can assert the generic
// <module>_update mapping without a real core gateway.
const invoke = vi.fn(async () => ({ ok: true }));
vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));

const scope = { tenantId: "t1", userId: "u1" } as never;

describe("moduleUpdateOperationForContextType", () => {
  it("derives <module>_update from a dotted context_type", async () => {
    const { moduleUpdateOperationForContextType } = await import(
      "../apply-field-updates.js"
    );
    expect(moduleUpdateOperationForContextType("contacts.person")).toBe(
      "contacts_update"
    );
    expect(moduleUpdateOperationForContextType("offers.offer")).toBe(
      "offers_update"
    );
    // No dot → the whole string is the module id.
    expect(moduleUpdateOperationForContextType("leads")).toBe("leads_update");
    expect(moduleUpdateOperationForContextType("")).toBeNull();
  });
});

describe("applyApprovedFieldUpdates", () => {
  it("writes the patch via the context_type's module update operation", async () => {
    invoke.mockClear();
    const { applyApprovedFieldUpdates } = await import(
      "../apply-field-updates.js"
    );
    const result = await applyApprovedFieldUpdates({
      contextId: "c-123",
      contextType: "contacts.person",
      patch: { email: "a@b.co", phone: null },
      scope,
    });
    expect(result).toEqual({ applied: 2 });
    expect(invoke).toHaveBeenCalledWith("contacts_update", {
      id: "c-123",
      patch: { email: "a@b.co", phone: null },
    });
  });

  it("is a no-op for an empty patch (no operation invoked)", async () => {
    invoke.mockClear();
    const { applyApprovedFieldUpdates } = await import(
      "../apply-field-updates.js"
    );
    const result = await applyApprovedFieldUpdates({
      contextId: "c-1",
      contextType: "contacts.person",
      patch: {},
      scope,
    });
    expect(result).toEqual({ applied: 0 });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("throws on an unresolvable context_type (no silent fallback)", async () => {
    const { applyApprovedFieldUpdates } = await import(
      "../apply-field-updates.js"
    );
    await expect(
      applyApprovedFieldUpdates({
        contextId: "c-1",
        contextType: "",
        patch: { x: 1 },
        scope,
      })
    ).rejects.toThrow(/unresolvable context_type/);
  });
});
