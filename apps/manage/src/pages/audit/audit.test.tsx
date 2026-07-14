/** @vitest-environment happy-dom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const listAuditEvents = vi.fn();
const listAuditDistincts = vi.fn();
vi.mock("@/lib/api/audit", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/audit")>("@/lib/api/audit");
  return {
    ...actual,
    listAuditEvents: (...args: unknown[]) => listAuditEvents(...args),
    listAuditDistincts: (...args: unknown[]) => listAuditDistincts(...args),
  };
});

const listTenants = vi.fn();
vi.mock("@/lib/api/tenants", () => ({
  listTenants: () => listTenants(),
  getTenant: vi.fn(),
  listTenantMembers: vi.fn(),
}));

const { AuditPage } = await import("./AuditPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuditPage", () => {
  it("renders a cross-tenant event with its resolved tenant name", async () => {
    listTenants.mockResolvedValue([
      { id: "t1", name: "Acme GmbH", slug: "acme" },
    ]);
    listAuditDistincts.mockResolvedValue({
      types: ["tool.invoke"],
      module_ids: ["contacts"],
    });
    listAuditEvents.mockResolvedValue({
      events: [
        {
          id: "e1",
          timestamp: "2026-07-14T10:00:00Z",
          type: "tool.invoke",
          actor_id: "user-1",
          tenant_id: "t1",
          module_id: "contacts",
          operation_id: "contacts.create",
          detail: { ok: true },
          source_kind: "module",
          source_module_id: "contacts",
          source_component: null,
        },
      ],
      has_more: false,
      total: 1,
    });

    renderPage(<AuditPage />);

    expect(await screen.findByText("tool.invoke")).toBeTruthy();
    // tenant_id resolves to the tenant's display name from the tenants list
    expect(screen.getByText("Acme GmbH")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();
  });
});
