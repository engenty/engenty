/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

// Sync/restore live in the shell topbar — need the real `usePageConfig` (global
// setup no-ops it) plus a stand-in that renders the registered actions.
vi.mock("@engenty/ui-plugin-sdk", async (importActual) =>
  importActual<Record<string, unknown>>()
);
const { PageHeaderProvider, usePageHeader } = await import(
  "@engenty/ui-plugin-sdk"
);

const listGatewayModels = vi.fn();
const listGatewayModelSyncRuns = vi.fn();
const listModelPricingHistory = vi.fn();
const restoreModelPricingDefaults = vi.fn();
const syncGatewayModels = vi.fn();
const updateGatewayModelAvailability = vi.fn();
vi.mock("@/lib/api/ai-models", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  listGatewayModels: (...args: unknown[]) => listGatewayModels(...args),
  listGatewayModelSyncRuns: (...args: unknown[]) =>
    listGatewayModelSyncRuns(...args),
  listModelPricingHistory: (...args: unknown[]) =>
    listModelPricingHistory(...args),
  restoreModelPricingDefaults: () => restoreModelPricingDefaults(),
  syncGatewayModels: (...args: unknown[]) => syncGatewayModels(...args),
  updateGatewayModelAvailability: (...args: unknown[]) =>
    updateGatewayModelAvailability(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AiModelsPage } = await import("./AiModelsPage");
const { AiModelPricingHistoryPage } = await import(
  "./AiModelPricingHistoryPage"
);

function TopbarActions() {
  return <>{usePageHeader().actions}</>;
}

function renderCatalog() {
  return renderPage(
    <PageHeaderProvider>
      <TopbarActions />
      <AiModelsPage />
    </PageHeaderProvider>
  );
}

function model(overrides: Record<string, unknown> = {}) {
  return {
    available_for_chat: false,
    available_for_embedding: false,
    available_for_image: false,
    available_for_rerank: false,
    available_for_routing: false,
    available_for_video: false,
    cached_input_per_mtok_micros: 100,
    context_tokens: 128_000,
    display_name: "GPT Test",
    gateway: "vercel",
    input_per_mtok_micros: 1000,
    last_synced_at: "2026-07-20T00:00:00Z",
    model_id: "openai/gpt-test",
    output_per_mtok_micros: 4000,
    price_tier: "medium",
    provider: "openai",
    providers: ["openai"],
    released_at: "2026-07-01T00:00:00Z",
    tags: ["vision"],
    use_cases: ["text", "code"],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("AiModelsPage", () => {
  it("lists the catalog with its activation status and last sync run", async () => {
    listGatewayModels.mockResolvedValue([
      model(),
      model({
        available_for_chat: true,
        available_for_routing: true,
        display_name: "Claude Test",
        model_id: "anthropic/claude-test",
        provider: "anthropic",
        providers: ["anthropic"],
      }),
    ]);
    listGatewayModelSyncRuns.mockResolvedValue([
      {
        completed_at: "2026-07-25T10:05:00Z",
        error_text: null,
        id: "run-1",
        inserted_pricing_count: 3,
        model_count: 2,
        started_at: "2026-07-25T10:00:00Z",
        status: "succeeded",
        trigger: "manual",
        updated_model_count: 2,
      },
    ]);

    renderCatalog();

    expect(await screen.findByText("openai/gpt-test")).toBeTruthy();
    expect(screen.getByText("anthropic/claude-test")).toBeTruthy();
    expect(screen.getByText("2 of 2 models")).toBeTruthy();
    // Gateway is its own column now, not a prefix on the model id.
    expect(screen.getAllByText("vercel").length).toBe(2);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("Succeeded")).toBeTruthy();
  });

  it("derives all six availability purposes from the model's use cases", async () => {
    listGatewayModels.mockResolvedValue([model()]);
    listGatewayModelSyncRuns.mockResolvedValue([]);
    updateGatewayModelAvailability.mockResolvedValue(model());

    renderCatalog();

    fireEvent.click(await screen.findByLabelText("Activate openai/gpt-test"));

    await waitFor(() =>
      expect(updateGatewayModelAvailability).toHaveBeenCalled()
    );
    expect(updateGatewayModelAvailability.mock.calls[0][0]).toEqual({
      gateway: "vercel",
      model_id: "openai/gpt-test",
      available_for_chat: true,
      available_for_embedding: false,
      available_for_image: false,
      available_for_rerank: false,
      available_for_routing: true,
      available_for_video: false,
    });
  });

  it("syncs the catalog and reports what changed", async () => {
    listGatewayModels.mockResolvedValue([model()]);
    listGatewayModelSyncRuns.mockResolvedValue([]);
    syncGatewayModels.mockResolvedValue({
      inserted_pricing_count: 4,
      model_count: 12,
      run: { id: "run-2" },
      updated_model_count: 12,
    });

    renderCatalog();

    fireEvent.click(await screen.findByText("Sync now"));

    await waitFor(() =>
      expect(syncGatewayModels).toHaveBeenCalledWith({ update_pricing: true })
    );
    expect(
      await screen.findByText("Synced 12 models, 4 pricing rows inserted.")
    ).toBeTruthy();
  });

  it("restores pricing defaults only after the confirm dialog is accepted", async () => {
    listGatewayModels.mockResolvedValue([model()]);
    listGatewayModelSyncRuns.mockResolvedValue([]);
    restoreModelPricingDefaults.mockResolvedValue({
      availability_restored: 5,
      restored: 7,
    });

    renderCatalog();

    fireEvent.click(await screen.findByText("Restore defaults"));
    expect(restoreModelPricingDefaults).not.toHaveBeenCalled();

    const confirm = await screen.findAllByText("Restore defaults");
    fireEvent.click(confirm.at(-1) as HTMLElement);

    expect(
      await screen.findByText("Restored 7 pricing rows and 5 activation flags.")
    ).toBeTruthy();
  });

  it("keeps a provider filter selected and lets you clear or switch it", async () => {
    const user = userEvent.setup();
    listGatewayModels.mockImplementation(
      async (filters: { provider?: string } = {}) => {
        const rows = [
          model(),
          model({
            display_name: "Claude Test",
            model_id: "anthropic/claude-test",
            provider: "anthropic",
            providers: ["anthropic"],
          }),
        ];
        return filters.provider
          ? rows.filter((row) => row.provider === filters.provider)
          : rows;
      }
    );
    listGatewayModelSyncRuns.mockResolvedValue([]);

    renderCatalog();

    await user.click(await screen.findByLabelText("Provider"));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "anthropic" })
    );

    await waitFor(() =>
      expect(listGatewayModels).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "anthropic" }),
        expect.anything()
      )
    );
    expect(screen.getByLabelText("Provider").textContent).toContain(
      "anthropic"
    );
    expect(screen.queryByText("openai/gpt-test")).toBeNull();
    expect(screen.getByText("anthropic/claude-test")).toBeTruthy();

    // Full facet list stays available after narrowing — switch without clearing.
    await user.click(screen.getByLabelText("Provider"));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "openai" })
    );

    await waitFor(() =>
      expect(listGatewayModels).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "openai" }),
        expect.anything()
      )
    );
    expect(screen.getByText("openai/gpt-test")).toBeTruthy();

    await user.click(screen.getByLabelText("Clear filter"));

    await waitFor(() =>
      expect(listGatewayModels).toHaveBeenCalledWith({}, expect.anything())
    );
    expect(screen.getByLabelText("Provider").textContent).toContain(
      "All providers"
    );
  });
});

describe("AiModelPricingHistoryPage", () => {
  it("renders historical pricing rows", async () => {
    listModelPricingHistory.mockResolvedValue([
      {
        cached_input_per_mtok_micros: 100,
        currency: "usd",
        id: "pricing-1",
        input_per_mtok_micros: 1000,
        model_id: "openai/gpt-test",
        output_per_mtok_micros: 4000,
        reasoning_per_mtok_micros: 0,
        valid_from: "2026-07-01T00:00:00Z",
        valid_to: null,
      },
    ]);

    renderPage(
      <PageHeaderProvider>
        <AiModelPricingHistoryPage />
      </PageHeaderProvider>
    );

    expect(await screen.findByText("openai/gpt-test")).toBeTruthy();
    expect(screen.getByText("$0.0010")).toBeTruthy();
    expect(screen.getByText("$0.0040")).toBeTruthy();
  });
});
