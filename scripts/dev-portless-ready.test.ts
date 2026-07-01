import { describe, expect, it, vi } from "vitest";
import {
  buildReadyBanner,
  buildStartingHint,
  resolveGatewayOrigin,
} from "./dev-portless-ready.mjs";

describe("dev-portless-ready", () => {
  it("resolveGatewayOrigin prefers GATEWAY_ORIGIN", () => {
    vi.stubEnv("GATEWAY_ORIGIN", "https://tab-ui.engenty.localhost");
    vi.stubEnv("ENGENTY_UI_BASE_URL", "https://engenty.localhost");
    expect(resolveGatewayOrigin()).toBe("https://tab-ui.engenty.localhost");
  });

  it("buildReadyBanner includes gateway and loopback ports", () => {
    const banner = buildReadyBanner({
      gatewayOrigin: "https://engenty.localhost",
      uiPort: 5173,
      corePort: 8787,
    });
    expect(banner).toContain("Open https://engenty.localhost/");
    expect(banner).toContain("Loopback UI :5173 · core :8787");
  });

  it("buildReadyBanner includes worktree domain", () => {
    const banner = buildReadyBanner({
      gatewayOrigin: "https://tab-ui.engenty.localhost",
      uiPort: 5183,
      corePort: 8797,
      domain: "tab-ui",
    });
    expect(banner).toContain("Worktree: tab-ui");
    expect(banner).toContain(":5183");
    expect(banner).toContain(":8797");
  });

  it("buildStartingHint mentions gateway origin", () => {
    expect(
      buildStartingHint({ gatewayOrigin: "https://engenty.localhost" })
    ).toContain("https://engenty.localhost/");
  });
});
