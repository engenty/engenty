/** @vitest-environment happy-dom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntitlementPackage } from "@/lib/api/entitlements";
import { renderPage } from "@/test-utils";

vi.mock("@engenty/ui-plugin-sdk", async (importActual) =>
  importActual<Record<string, unknown>>()
);
const { PageHeaderProvider } = await import("@engenty/ui-plugin-sdk");

const getPackage = vi.fn();
vi.mock("@/lib/api/entitlements", () => ({
  getPackage: (id: string) => getPackage(id),
  listPackages: vi.fn(),
  syncPackageDefaults: vi.fn(),
  getTenantEntitlements: vi.fn(),
  setTenantPackage: vi.fn(),
  setTenantOverride: vi.fn(),
  clearTenantOverride: vi.fn(),
}));

const { PackageDetailPage } = await import("./PackageDetailPage");

const teamPkg: EntitlementPackage = {
  id: "team",
  version: 2,
  label: "Team",
  modules: ["contacts", "projects"],
  featureFlags: { "contacts.csv_import": true },
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
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PackageDetailPage", () => {
  it("renders package identity, seats, and modules", async () => {
    getPackage.mockResolvedValue(teamPkg);
    renderPage(
      <PageHeaderProvider>
        <PackageDetailPage />
      </PageHeaderProvider>,
      { path: "/packages/:id", initialEntry: "/packages/team" }
    );

    expect(await screen.findByRole("heading", { name: "Team" })).toBeTruthy();
    expect(screen.getByText("team · v2")).toBeTruthy();
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("contacts, projects")).toBeTruthy();
    expect(screen.getByText("contacts.csv_import")).toBeTruthy();
  });
});
