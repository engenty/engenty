/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EntitlementPackage,
  TenantEntitlements,
} from "@/lib/api/entitlements";
import { renderPage } from "@/test-utils";

const listPackages = vi.fn();
const syncPackageDefaults = vi.fn();
const getTenantEntitlements = vi.fn();
const setTenantPackage = vi.fn();
const setTenantOverride = vi.fn();
const clearTenantOverride = vi.fn();

vi.mock("@/lib/api/entitlements", () => ({
  listPackages: () => listPackages(),
  getPackage: (id: string) =>
    listPackages().then(
      (pkgs: EntitlementPackage[]) =>
        pkgs.find((p) => p.id === id) ?? Promise.reject(new Error("missing"))
    ),
  syncPackageDefaults: () => syncPackageDefaults(),
  getTenantEntitlements: (id: string) => getTenantEntitlements(id),
  setTenantPackage: (id: string, pkg: string | null) =>
    setTenantPackage(id, pkg),
  setTenantOverride: (id: string, o: unknown) => setTenantOverride(id, o),
  clearTenantOverride: (id: string) => clearTenantOverride(id),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { PackagesListPage } = await import("@/pages/packages/PackagesListPage");
const { TenantEntitlementsTab } = await import("./TenantEntitlementsTab");

function pkg(over: Partial<EntitlementPackage> = {}): EntitlementPackage {
  return {
    id: "team",
    version: 1,
    label: "Team",
    modules: ["contacts", "projects"],
    featureFlags: {},
    aiUsagePolicy: {
      period_mode: "calendar",
      period_unit: "month",
      included_cost_micros: 20_000_000,
      hard_limit_cost_micros: 40_000_000,
      soft_limit_cost_micros: null,
      enforcement_mode: "enforce",
      currency: "usd",
      allowed_models: null,
    },
    appLimits: { maxUsers: 25, enforcement_mode: "enforce" },
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PackagesListPage", () => {
  it("renders a row per package with seats and AI limit", async () => {
    listPackages.mockResolvedValue([
      pkg(),
      pkg({
        id: "enterprise",
        label: "Enterprise",
        modules: null,
        appLimits: { maxUsers: null, enforcement_mode: "observe" },
      }),
    ]);
    renderPage(<PackagesListPage />);

    expect(await screen.findByText("Team")).toBeTruthy();
    expect(screen.getByText("Enterprise")).toBeTruthy();
    // team seats 25 + enterprise unlimited
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("∞")).toBeTruthy();
    // enterprise shows "All" modules (null allow-list)
    expect(screen.getByText("All")).toBeTruthy();
  });
});

describe("TenantEntitlementsTab", () => {
  function entitlements(
    over: Partial<TenantEntitlements> = {}
  ): TenantEntitlements {
    return {
      tenantId: "t1",
      packageId: "team",
      override: null,
      resolved: {
        packageId: "team",
        modules: ["contacts", "projects"],
        featureFlags: {},
        aiUsagePolicy: pkg().aiUsagePolicy,
        appLimits: { maxUsers: 25, enforcement_mode: "enforce" },
      },
      packages: [pkg(), pkg({ id: "free", label: "Free" })],
      ...over,
    };
  }

  it("shows the resolved summary for the assigned package", async () => {
    getTenantEntitlements.mockResolvedValue(entitlements());
    renderPage(<TenantEntitlementsTab tenantId="t1" />);

    expect(await screen.findByText("Resolved entitlements")).toBeTruthy();
    // resolved seats = 25
    expect(screen.getByText("25")).toBeTruthy();
  });

  it("saves a seat override through setTenantOverride", async () => {
    getTenantEntitlements.mockResolvedValue(entitlements());
    setTenantOverride.mockResolvedValue({ tenantId: "t1", override: {} });
    const user = userEvent.setup();
    renderPage(<TenantEntitlementsTab tenantId="t1" />);

    const input = await screen.findByLabelText("Max users");
    await user.clear(input);
    await user.type(input, "50");
    await user.click(screen.getByRole("button", { name: "Save override" }));

    await waitFor(() => expect(setTenantOverride).toHaveBeenCalled());
    const [, override] = setTenantOverride.mock.calls[0];
    expect(override.appLimits.maxUsers).toBe(50);
  });
});
