/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  MASTRA_STUDIO_CONFIG_STORAGE_KEY,
  seedMastraStudioDevConfig,
} from "./mastra-studio-dev-config.js";

describe("seedMastraStudioDevConfig", () => {
  afterEach(() => {
    window.localStorage.removeItem(MASTRA_STUDIO_CONFIG_STORAGE_KEY);
  });

  it("writes gateway URL, /ai prefix, and Authorization header", () => {
    seedMastraStudioDevConfig({
      accessToken: "test-token",
      gatewayBaseUrl: "https://engenty.localhost",
    });
    const raw = window.localStorage.getItem(MASTRA_STUDIO_CONFIG_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "{}") as {
      baseUrl: string;
      apiPrefix: string;
      headers: Record<string, string>;
    };
    expect(parsed.baseUrl).toBe("https://engenty.localhost");
    expect(parsed.apiPrefix).toBe("/ai");
    expect(parsed.headers.Authorization).toBe("Bearer test-token");
  });
});
