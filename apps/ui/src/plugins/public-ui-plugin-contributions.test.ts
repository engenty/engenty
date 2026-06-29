import { describe, expect, it, vi } from "vitest";
import { resolvePublicUiPluginContributions } from "./public-ui-plugin-contributions";

vi.mock("@engenty/i18n/ui", () => ({
  getEngentyI18nApi: () => ({
    preloadCoreNamespaces: vi.fn(async () => undefined),
    registerNamespace: vi.fn(),
    t: (key: string) => key,
  }),
}));

describe("resolvePublicUiPluginContributions", () => {
  it("loads only explicit public-safe route contributions", async () => {
    const result = await resolvePublicUiPluginContributions();

    expect(result.diagnostics).toHaveLength(0);
    expect(result.contributions.routes).toEqual([]);
  });
});
