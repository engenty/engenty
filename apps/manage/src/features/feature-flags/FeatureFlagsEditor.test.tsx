/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureFlagsManageResponse } from "@/lib/api/feature-flags";
import { renderPage } from "@/test-utils";

const getManageFlags = vi.fn();
const saveFlagUpdates = vi.fn();
vi.mock("@/lib/api/feature-flags", () => ({
  getManageFlags: () => getManageFlags(),
  saveFlagUpdates: (updates: unknown) => saveFlagUpdates(updates),
}));

const { FeatureFlagsEditor } = await import("./FeatureFlagsEditor");

function manageResponse(resolved: boolean): FeatureFlagsManageResponse {
  return {
    definitions: [
      { key: "kb.triage", pluginId: "kb", namespace: "kb", default: false },
    ],
    global: {},
    tenant: resolved ? { "kb.triage": true } : {},
    resolved: { "kb.triage": resolved },
    tenantId: "t1",
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FeatureFlagsEditor (tenant scope)", () => {
  it("stages a tenant override, saves the exact payload, and reflects the new resolved value", async () => {
    const user = userEvent.setup();
    getManageFlags
      .mockResolvedValueOnce(manageResponse(false))
      .mockResolvedValue(manageResponse(true));
    saveFlagUpdates.mockResolvedValue({ saved: true });

    renderPage(<FeatureFlagsEditor tenantId="t1" />);

    expect(await screen.findByText("Resolved: Off")).toBeTruthy();

    await user.click(screen.getByRole("switch", { name: "kb.triage" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveFlagUpdates).toHaveBeenCalledWith([
        { key: "kb.triage", tenant_id: "t1", enabled: true },
      ])
    );
    expect(await screen.findByText("Resolved: On")).toBeTruthy();
  });
});
