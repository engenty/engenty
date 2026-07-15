/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const listAutomationRules = vi.fn();
const setAutomationRuleEnabled = vi.fn();
const deleteAutomationRule = vi.fn();
vi.mock("@/lib/api/automation", () => ({
  listAutomationRules: () => listAutomationRules(),
  setAutomationRuleEnabled: (...args: unknown[]) =>
    setAutomationRuleEnabled(...args),
  deleteAutomationRule: (...args: unknown[]) => deleteAutomationRule(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { TenantAutomationTab } = await import("./TenantAutomationTab");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TenantAutomationTab", () => {
  it("renders a rule and toggles it off", async () => {
    listAutomationRules.mockResolvedValue([
      {
        id: "rule-1",
        tenant_id: "t1",
        hook_id: "contact.created",
        effect_type: "agent",
        effect_id: "welcome-agent",
        enabled: true,
        filter_json: {},
        effect_input_json: null,
        created_at: "2026-07-15T00:00:00Z",
        updated_at: "2026-07-15T00:00:00Z",
      },
    ]);
    setAutomationRuleEnabled.mockResolvedValue({});

    renderPage(<TenantAutomationTab tenantId="t1" />);

    expect(await screen.findByText("contact.created")).toBeTruthy();
    expect(screen.getByText("welcome-agent")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(setAutomationRuleEnabled).toHaveBeenCalledWith(
        "t1",
        "rule-1",
        false
      )
    );
  });
});
