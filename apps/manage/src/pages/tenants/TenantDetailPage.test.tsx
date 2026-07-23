/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManageTenant, TenantMember } from "@/lib/api/tenants";
import { renderPage } from "@/test-utils";

// This page registers its primary actions in the shell topbar, so it needs the
// REAL `usePageConfig` (the global setup no-ops it) plus a stand-in topbar that
// renders whatever the page registered.
vi.mock("@engenty/ui-plugin-sdk", async (importActual) =>
  importActual<Record<string, unknown>>()
);
const { PageHeaderProvider, usePageHeader } = await import(
  "@engenty/ui-plugin-sdk"
);

const getTenant = vi.fn();
const listTenantMembers = vi.fn();
const setTenantStatus = vi.fn();
const removeMember = vi.fn();
vi.mock("@/lib/api/tenants", () => ({
  getTenant: () => getTenant(),
  listTenantMembers: () => listTenantMembers(),
  setTenantStatus: (id: string, status: string) => setTenantStatus(id, status),
  removeMember: (tenantId: string, userId: string) =>
    removeMember(tenantId, userId),
  switchToTenant: vi.fn(),
  updateMemberRole: vi.fn(),
  assignMember: vi.fn(),
}));
vi.mock("@/lib/api/users", () => ({ listUsers: () => Promise.resolve([]) }));

const { TenantDetailPage } = await import("./TenantDetailPage");

const tenant: ManageTenant = {
  id: "t1",
  name: "Acme",
  slug: "acme",
  tier: "platform",
  status: "active",
  package_id: null,
  tenant_connection_mode: "shared_instance",
  created_at: "2026-07-14T00:00:00Z",
  updated_at: "2026-07-14T00:00:00Z",
};

const member: TenantMember = {
  id: "u1",
  email: "u@acme.test",
  display_name: "Ulla",
  role: "member",
  tenant_role: "member",
  tenant_id: "t1",
  is_super_admin: false,
  created_at: "2026-07-14T00:00:00Z",
  updated_at: "2026-07-14T00:00:00Z",
};

function TopbarActions() {
  return <>{usePageHeader().actions}</>;
}

function render() {
  return renderPage(
    <PageHeaderProvider>
      <TopbarActions />
      <TenantDetailPage />
    </PageHeaderProvider>,
    {
      path: "/tenants/:id",
      initialEntry: "/tenants/t1",
    }
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TenantDetailPage", () => {
  it("suspends the tenant through the status menu and confirmation", async () => {
    const user = userEvent.setup();
    getTenant.mockResolvedValue(tenant);
    listTenantMembers.mockResolvedValue([]);
    setTenantStatus.mockResolvedValue({ ...tenant, status: "suspended" });
    render();

    await screen.findByRole("heading", { name: "Acme" });
    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(await screen.findByText("Suspend"));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(setTenantStatus).toHaveBeenCalledWith("t1", "suspended")
    );
  });

  it("removes a member after confirmation", async () => {
    const user = userEvent.setup();
    getTenant.mockResolvedValue(tenant);
    listTenantMembers.mockResolvedValue([member]);
    removeMember.mockResolvedValue({ removed: true });
    render();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("t1", "u1"));
  });
});
