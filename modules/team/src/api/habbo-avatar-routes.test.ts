import type { PluginHttpRouteContext } from "@engenty/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateImageBytes } = vi.hoisted(() => ({
  generateImageBytes: vi.fn(),
}));

vi.mock("@engenty/ai-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@engenty/ai-core")>()),
  generateImageBytes,
  readAiGatewayApiKeyFromEnv: () => "test-key",
}));

import { bindingsFromList, setPlatformBindings } from "@engenty/ai-core";
import { registerTeamHabboAvatarRoutes } from "./habbo-avatar-routes.js";
import { getRoute, makeMockApi } from "./test-helpers.js";

function bindImage(gateway: string, modelId: string) {
  setPlatformBindings(bindingsFromList([{ gateway, modelId, role: "image" }]));
}

function habboRoute() {
  const { api, httpRoutes } = makeMockApi();
  registerTeamHabboAvatarRoutes(api);
  return getRoute(httpRoutes, "post", "/api/team/avatars/habbo");
}

function invoke(body: unknown) {
  return habboRoute().handler({ body } as unknown as PluginHttpRouteContext);
}

describe("POST /api/team/avatars/habbo", () => {
  beforeEach(() => {
    generateImageBytes.mockReset();
  });

  afterEach(() => {
    setPlatformBindings(undefined);
  });

  it("draws every variation with the model bound to the image role", async () => {
    bindImage("vercel", "openai/gpt-image-1");
    generateImageBytes.mockResolvedValue(new Uint8Array([1]));

    const result = (await invoke({ variation_count: 2 })) as {
      avatars: unknown[];
      model: string;
    };

    expect(generateImageBytes).toHaveBeenCalledTimes(2);
    expect(generateImageBytes.mock.calls[0]?.[0]).toMatchObject({
      aspectRatio: "1:1",
      modelId: "openai/gpt-image-1",
      reference: null,
    });
    expect(result.model).toBe("openai/gpt-image-1");
    expect(result.avatars).toHaveLength(2);
  });

  it("returns 503 naming the role when bound to a gateway that cannot draw", async () => {
    bindImage("openrouter", "google/gemini-img");

    const res = (await invoke({})) as Response;

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("Image generation");
    expect(generateImageBytes).not.toHaveBeenCalled();
  });
});
