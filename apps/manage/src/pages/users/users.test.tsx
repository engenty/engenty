/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserDetail } from "@/lib/api/users";
import { renderPage } from "@/test-utils";

const getUser = vi.fn();
const setUserPassword = vi.fn();
const updateUser = vi.fn();
const updateMemberRole = vi.fn();
const removeMember = vi.fn();

vi.mock("@/lib/api/users", () => ({
  getUser: () => getUser(),
  setUserPassword: (id: string, pw: string) => setUserPassword(id, pw),
  updateUser: (id: string, patch: unknown) => updateUser(id, patch),
}));
vi.mock("@/lib/api/tenants", () => ({
  listTenants: () => Promise.resolve([]),
  updateMemberRole: (tenantId: string, userId: string, role: string) =>
    updateMemberRole(tenantId, userId, role),
  removeMember: (tenantId: string, userId: string) =>
    removeMember(tenantId, userId),
  assignMember: vi.fn(),
}));

const { UserDetailPage } = await import("./UserDetailPage");
const { UserEditPage } = await import("./UserEditPage");

const detail: UserDetail = {
  user: {
    id: "u1",
    email: "u@acme.test",
    display_name: "Ulla",
    role: "member",
    tenant_id: "t1",
    is_super_admin: false,
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
  },
  identities: [{ provider: "email" }],
  tenant_memberships: [
    { tenant_id: "t1", tenant_name: "Acme", role: "member" },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UserDetailPage", () => {
  it("changes a membership role", async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue(detail);
    updateMemberRole.mockResolvedValue({ updated: true });
    renderPage(<UserDetailPage />, {
      path: "/users/:id",
      initialEntry: "/users/u1",
    });

    await screen.findByRole("heading", { name: "Ulla" });
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "admin" }));

    await waitFor(() =>
      expect(updateMemberRole).toHaveBeenCalledWith("t1", "u1", "admin")
    );
  });
});

describe("UserEditPage", () => {
  it("sets a generated password", async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue(detail);
    setUserPassword.mockResolvedValue({ updated: true });
    renderPage(<UserEditPage />, {
      path: "/users/:id/edit",
      initialEntry: "/users/u1/edit",
    });

    await screen.findByText("Password");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(setUserPassword).toHaveBeenCalledTimes(1));
    expect(setUserPassword.mock.calls[0][0]).toBe("u1");
    expect(
      String(setUserPassword.mock.calls[0][1]).length
    ).toBeGreaterThanOrEqual(12);
  });
});
