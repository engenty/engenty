import type {
  PluginHttpRoute,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
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
import { registerKbCoverMediaRoutes } from "../src/api/kb-cover-media-routes.js";
import type { KbRepoFactory } from "../src/dal/contracts.js";
import { kbStorageKey } from "../src/lib/kb-storage-key.js";

const kb = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "handbook",
  space_id: "space-1",
  tenant_id: "tenant-1",
};
function bindImage(gateway: string, modelId: string) {
  setPlatformBindings(bindingsFromList([{ gateway, modelId, role: "image" }]));
}
const auth = {
  principalId: "user-1",
  scopeId: "default",
  tenantId: "tenant-1",
};

function setup() {
  const routes: PluginHttpRoute[] = [];
  const storage = {
    download: vi.fn(async () => new Uint8Array([5, 5])),
    upload: vi.fn(async () => undefined),
  };
  const api = {
    getStorageService: () => storage,
    registerHttpRoute: (route: PluginHttpRoute) => {
      routes.push(route);
    },
  } as unknown as Pick<
    PluginServerApi,
    "getStorageService" | "registerHttpRoute"
  >;
  const getRepo = () =>
    ({ kb: { getById: async () => kb } }) as unknown as KbRepoFactory;
  registerKbCoverMediaRoutes(api, getRepo);
  const route = routes.find((r) => r.path === "/api/kb/cover/ai");
  if (!route) {
    throw new Error("cover ai route not registered");
  }
  const invoke = (body: unknown) =>
    route.handler({
      auth,
      request: new Request("http://test/api/kb/cover/ai", {
        body: JSON.stringify(body),
        method: "POST",
      }),
    } as unknown as PluginHttpRouteContext);
  return { invoke, storage };
}

describe("POST /api/kb/cover/ai", () => {
  beforeEach(() => {
    generateImageBytes.mockReset();
  });

  afterEach(() => {
    setPlatformBindings(undefined);
  });

  it("generates with the model bound to the image role", async () => {
    bindImage("vercel", "openai/gpt-image-1");
    generateImageBytes.mockResolvedValue(new Uint8Array([1]));
    const { invoke, storage } = setup();

    const result = (await invoke({
      kb_id: kb.id,
      mode: "generate",
      prompt: "a lighthouse",
    })) as { key: string };

    expect(generateImageBytes).toHaveBeenCalledWith({
      modelId: "openai/gpt-image-1",
      prompt: "a lighthouse",
      reference: null,
    });
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(result.key).toContain("covers");
  });

  it("passes the stored reference image in edit mode", async () => {
    bindImage("vercel", "google/gemini-2.5-flash-image");
    generateImageBytes.mockResolvedValue(new Uint8Array([1]));
    const { invoke } = setup();
    const refKey = kbStorageKey(kb, "covers", "old.jpg");

    await invoke({
      kb_id: kb.id,
      mode: "edit",
      prompt: "warmer",
      reference_object_key: refKey,
    });

    expect(generateImageBytes.mock.calls[0]?.[0]).toMatchObject({
      modelId: "google/gemini-2.5-flash-image",
      reference: { bytes: new Uint8Array([5, 5]), mediaType: "image/jpeg" },
    });
  });

  it("returns 503 naming the role when bound to a gateway that cannot draw", async () => {
    bindImage("openrouter", "google/gemini-img");
    const { invoke } = setup();

    const res = (await invoke({
      kb_id: kb.id,
      mode: "generate",
      prompt: "x",
    })) as Response;

    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain(
      "Image generation"
    );
    expect(generateImageBytes).not.toHaveBeenCalled();
  });
});
