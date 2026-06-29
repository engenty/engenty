import { clearApiClient, setApiClient } from "@engenty/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: {
    apiBaseUrl: "http://127.0.0.1:8787",
  },
}));

import { getPluginDetail, getPluginsDetailed } from "./client";

describe("plugins api client", () => {
  afterEach(() => {
    clearApiClient();
  });

  it("fetches plugin list using current session token", async () => {
    setApiClient({
      getAccessToken: async () => "session-token",
      getApiBaseUrl: () => "http://127.0.0.1:8787",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPluginsDetailed();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/plugins",
      expect.objectContaining({
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer session-token",
        }),
      })
    );
  });

  it("fetches plugin detail with typed response shape", async () => {
    setApiClient({
      getAccessToken: async () => "session-token",
      getApiBaseUrl: () => "http://127.0.0.1:8787",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: "plugin-a",
            sourceType: "package",
            source: "/tmp/plugin-a/index.ts",
            rootDir: "/tmp/plugin-a",
            manifestPath: "/tmp/plugin-a/manifest.json",
            enabled: true,
            loaded: true,
            cliCommands: [],
            services: [],
            httpRoutes: [],
            gatewayMethods: [],
            moduleOperations: [],
            diagnostics: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPluginDetail("plugin-a");

    expect(result.id).toBe("plugin-a");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/plugins/plugin-a",
      expect.any(Object)
    );
  });
});
