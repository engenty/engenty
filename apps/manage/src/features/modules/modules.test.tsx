/** @vitest-environment happy-dom */
import { ApiClientResponseError } from "@engenty/api-client";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginListItem } from "@/lib/api/plugins";
import { resolveEffectiveEnabled } from "@/lib/plugins-state";
import { renderPage } from "@/test-utils";

const listPlugins = vi.fn();
const setPluginEnabled = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/api/plugins", () => ({
  listPlugins: () => listPlugins(),
  setPluginEnabled: (id: string, enabled: boolean, tenantId?: string) =>
    setPluginEnabled(id, enabled, tenantId),
}));
vi.mock("sonner", () => ({
  toast: { error: (msg: string) => toastError(msg), success: vi.fn() },
}));

const { TenantModuleOverrides } = await import("./TenantModuleOverrides");

function plugin(over: Partial<PluginListItem> = {}): PluginListItem {
  return {
    id: "contacts",
    name: "Contacts",
    globalEnabled: false,
    enabled: false,
    tenantOverride: null,
    mandatory: false,
    loaded: true,
    diagnosticsCount: 0,
    effectiveState: { allowed: true },
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("resolveEffectiveEnabled", () => {
  it("uses the tenant override when set, else the global default", () => {
    expect(
      resolveEffectiveEnabled({ globalEnabled: true, tenantOverride: null })
    ).toBe(true);
    expect(
      resolveEffectiveEnabled({ globalEnabled: false, tenantOverride: null })
    ).toBe(false);
    expect(
      resolveEffectiveEnabled({ globalEnabled: false, tenantOverride: true })
    ).toBe(true);
    expect(
      resolveEffectiveEnabled({ globalEnabled: true, tenantOverride: false })
    ).toBe(false);
  });
});

describe("TenantModuleOverrides", () => {
  it("enables a plugin for the tenant", async () => {
    const user = userEvent.setup();
    listPlugins.mockResolvedValue([plugin()]);
    setPluginEnabled.mockResolvedValue({ pluginId: "contacts", enabled: true });
    renderPage(<TenantModuleOverrides tenantId="t1" />);

    await user.click(await screen.findByRole("switch", { name: "Contacts" }));

    await waitFor(() =>
      expect(setPluginEnabled).toHaveBeenCalledWith("contacts", true, "t1")
    );
  });

  it("surfaces blockedReasons when activation is blocked", async () => {
    const user = userEvent.setup();
    listPlugins.mockResolvedValue([plugin()]);
    setPluginEnabled.mockRejectedValue(
      new ApiClientResponseError({
        status: 409,
        message: "blocked",
        code: "plugin.tenant_activation.blocked",
        details: { blockedReasons: ["needs dependency: teams"] },
      })
    );
    renderPage(<TenantModuleOverrides tenantId="t1" />);

    await user.click(await screen.findByRole("switch", { name: "Contacts" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("needs dependency: teams")
      )
    );
  });
});
