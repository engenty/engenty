/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const getEnvVars = vi.fn();
vi.mock("@/lib/api/settings", () => ({
  getEnvVars: () => getEnvVars(),
}));

const { SettingsPage } = await import("./SettingsPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("renders env vars and filters by key", async () => {
    getEnvVars.mockResolvedValue([
      { key: "NODE_ENV", value: "production", masked: false },
      { key: "SUPABASE_SERVICE_KEY", value: "abcd••ef", masked: true },
    ]);

    renderPage(<SettingsPage />);

    expect(await screen.findByText("NODE_ENV")).toBeTruthy();
    expect(screen.getByText("SUPABASE_SERVICE_KEY")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Filter keys…"), {
      target: { value: "node" },
    });

    expect(screen.getByText("NODE_ENV")).toBeTruthy();
    expect(screen.queryByText("SUPABASE_SERVICE_KEY")).toBeNull();
  });
});
