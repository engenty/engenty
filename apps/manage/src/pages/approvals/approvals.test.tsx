/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const listPendingApprovals = vi.fn();
const decideApproval = vi.fn();
vi.mock("@/lib/api/approvals", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/approvals")>(
    "@/lib/api/approvals"
  );
  return {
    ...actual,
    listPendingApprovals: () => listPendingApprovals(),
    decideApproval: (...args: unknown[]) => decideApproval(...args),
  };
});

const listTenants = vi.fn();
vi.mock("@/lib/api/tenants", () => ({
  listTenants: () => listTenants(),
  getTenant: vi.fn(),
  listTenantMembers: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { ApprovalsPage } = await import("./ApprovalsPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ApprovalsPage", () => {
  it("renders a pending request and approves it with the default scope", async () => {
    listTenants.mockResolvedValue([
      { id: "t1", name: "Acme GmbH", slug: "acme" },
    ]);
    listPendingApprovals.mockResolvedValue([
      {
        id: "req-1",
        createdAt: "2026-07-14T10:00:00Z",
        expiresAt: "2026-07-14T10:05:00Z",
        status: "pending",
        actorId: "user-1",
        tenantId: "t1",
        moduleId: "contacts",
        operationId: "contacts.delete",
        reason: "Bulk delete",
      },
    ]);
    decideApproval.mockResolvedValue({ id: "req-1", status: "approved" });

    renderPage(<ApprovalsPage />);

    expect(await screen.findByText("contacts.delete")).toBeTruthy();
    expect(screen.getByText("Acme GmbH")).toBeTruthy();

    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() =>
      expect(decideApproval).toHaveBeenCalledWith("req-1", "allow_once")
    );
  });
});
