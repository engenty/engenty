/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const listSearchProviders = vi.fn();
const getSearchProviderStatus = vi.fn();
const searchProvider = vi.fn();
vi.mock("@/lib/api/search-index", () => ({
  listSearchProviders: () => listSearchProviders(),
  getSearchProviderStatus: (...args: unknown[]) =>
    getSearchProviderStatus(...args),
  searchProvider: (...args: unknown[]) => searchProvider(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SearchIndexPage } = await import("./SearchIndexPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchIndexPage", () => {
  it("lists providers and runs a test search on the selected one", async () => {
    listSearchProviders.mockResolvedValue([
      {
        id: "workspace",
        entity_name: "documents",
        module_id: "core",
        is_system: true,
        version: "1.0.0",
        capabilities: [],
        config: null,
        operation_id: null,
        registered_at: "2026-07-15T00:00:00Z",
        supports: { backfill: true, search: true, status: true },
      },
    ]);
    getSearchProviderStatus.mockResolvedValue({ healthy: true, count: 42 });
    searchProvider.mockResolvedValue({
      id: "workspace",
      total: 1,
      matches: [{ score: 0.9, title: "Invoice 2026" }],
    });

    renderPage(<SearchIndexPage />);

    fireEvent.click(await screen.findByText("workspace"));
    // status renders
    expect(await screen.findByText(/healthy/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Test query…"), {
      target: { value: "invoice" },
    });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() =>
      expect(searchProvider).toHaveBeenCalledWith("workspace", {
        query: "invoice",
        strategy: "hybrid",
        limit: 25,
      })
    );
    expect(await screen.findByText("Invoice 2026")).toBeTruthy();
  });
});
