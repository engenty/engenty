/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManageTenant } from "@/lib/api/tenants";
import { renderPage } from "@/test-utils";

// List page registers create in the shell topbar — need the real `usePageConfig`
// (global setup no-ops it) plus a stand-in that renders registered actions.
vi.mock("@engenty/ui-plugin-sdk", async (importActual) =>
  importActual<Record<string, unknown>>()
);
const { PageHeaderProvider, usePageHeader } = await import(
  "@engenty/ui-plugin-sdk"
);

const listTenants = vi.fn();
const createTenant = vi.fn();
vi.mock("@/lib/api/tenants", () => ({
  listTenants: () => listTenants(),
  createTenant: (input: unknown) => createTenant(input),
}));

const { TenantsListPage } = await import("./TenantsListPage");

function tenant(over: Partial<ManageTenant> = {}): ManageTenant {
  return {
    id: "t1",
    name: "Acme",
    slug: "acme",
    tier: "platform",
    status: "active",
    tenant_connection_mode: "shared_instance",
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
    ...over,
  };
}

function TopbarActions() {
  return <>{usePageHeader().actions}</>;
}

function render() {
  return renderPage(
    <PageHeaderProvider>
      <TopbarActions />
      <TenantsListPage />
    </PageHeaderProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TenantsListPage", () => {
  it("renders tenant rows with tier and status", async () => {
    listTenants.mockResolvedValue([
      tenant({ id: "t1", name: "Acme", slug: "acme" }),
      tenant({ id: "t2", name: "Globex", slug: "globex", status: "suspended" }),
    ]);
    render();

    expect(await screen.findByText("Acme")).toBeTruthy();
    expect(screen.getByText("Globex")).toBeTruthy();
    expect(screen.getByText("Suspended")).toBeTruthy();
  });

  it("creates a tenant with an auto-suggested slug", async () => {
    const user = userEvent.setup();
    listTenants.mockResolvedValue([]);
    createTenant.mockResolvedValue(tenant());
    render();

    await screen.findByText("Nothing here yet.");
    await user.click(screen.getByRole("button", { name: "New tenant" }));
    await user.type(screen.getByLabelText("Name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create tenant" }));

    await waitFor(() =>
      expect(createTenant).toHaveBeenCalledWith({ slug: "acme", name: "Acme" })
    );
  });
});
