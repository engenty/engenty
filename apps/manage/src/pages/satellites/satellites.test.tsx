/** @vitest-environment happy-dom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Satellite } from "@/lib/api/satellites";
import { renderPage } from "@/test-utils";

const listSatellites = vi.fn();
vi.mock("@/lib/api/satellites", () => ({
  listSatellites: () => listSatellites(),
  createSatellite: vi.fn(),
  probeSatelliteHealth: vi.fn(),
  deleteSatellite: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { SatellitesListPage } = await import("./SatellitesListPage");

function sat(over: Partial<Satellite> = {}): Satellite {
  return {
    id: "s1",
    tenant_id: null,
    name: "Acme Box",
    slug: "acme-box",
    status: "active",
    endpoints: { studioUrl: "https://studio.acme.example" },
    credential_ref: null,
    pinned_version: "v1.2.3",
    health: { status: "healthy", checkedAt: null },
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SatellitesListPage", () => {
  it("renders a row with status, health and a Studio deep-link", async () => {
    listSatellites.mockResolvedValue([sat()]);
    renderPage(<SatellitesListPage />);

    expect(await screen.findByText("Acme Box")).toBeTruthy();
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    // health + status badges resolve to human labels
    expect(screen.getByText("Healthy")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    // Studio deep-link points at the satellite's own Studio
    const link = screen.getByText("Open Studio") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://studio.acme.example");
  });
});
