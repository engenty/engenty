import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import type { RealtimeClientSecretFetch } from "../api/realtime-session-routes.js";
import { type CreateAppOptions, createApp } from "../app.js";
import {
  bindTestModelsPerTest,
  testModelId,
} from "./helpers/test-model-bindings.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const scopeResolver = createStaticAiScopeResolver({
  tenantId: TENANT_ID,
  userId: USER_ID,
});

function createIsolatedApp(options: CreateAppOptions = {}) {
  return createApp({
    agentRunStore: null,
    threadStore: null,
    disableGatewayModelScheduler: true,
    registryStore: null,
    realtimeVoiceConfigResolver: null,
    usageStore: null,
    ...options,
  });
}

bindTestModelsPerTest();

describe("realtime session routes", () => {
  it("requires authenticated AI scope", async () => {
    const app = await createIsolatedApp({
      openAiRealtimeApiKey: () => "sk-test",
      scopeResolver: async () => ({
        error: "agent_threads.unauthorized",
        ok: false,
        status: 401,
      }),
    });

    const res = await app.request("http://localhost/ai/v1/realtime/sessions", {
      method: "POST",
    });

    expect(res.status).toBe(401);
  });

  it("mints a client secret without exposing the server key or raw caller ids", async () => {
    const openAiFetch = vi.fn<RealtimeClientSecretFetch>(async () =>
      Response.json({ expires_at: 1_800_000_000, value: "ek_test" })
    );
    const app = await createIsolatedApp({
      openAiRealtimeApiKey: () => "sk-server",
      openAiRealtimeFetch: openAiFetch,
      scopeResolver,
    });

    const res = await app.request("http://localhost/ai/v1/realtime/sessions", {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("sk-server");
    const sent = JSON.stringify(openAiFetch.mock.calls[0]?.[1]);
    expect(sent).not.toContain(TENANT_ID);
    expect(sent).not.toContain(USER_ID);
    const requestBody = JSON.parse(
      String((openAiFetch.mock.calls[0]?.[1] as RequestInit).body)
    );
    // No workspace pick: the platform `realtime` binding.
    expect(requestBody.session.model).toBe(testModelId("realtime"));
  });

  it("uses the tenant's own realtime model over the platform binding", async () => {
    const openAiFetch = vi.fn<RealtimeClientSecretFetch>(async () =>
      Response.json({
        expires_at: 1_800_000_000,
        value: "ek_test",
      })
    );
    const app = await createIsolatedApp({
      openAiRealtimeApiKey: () => "sk-server",
      openAiRealtimeFetch: openAiFetch,
      realtimeVoiceConfigResolver: async () => ({
        openai_model: "gpt-realtime-2",
        provider: "openai",
      }),
      scopeResolver,
    });

    const res = await app.request("http://localhost/ai/v1/realtime/sessions", {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const requestBody = JSON.parse(
      String((openAiFetch.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(requestBody.session.model).toBe("gpt-realtime-2");
  });

  it("does not mint an OpenAI session when tenant selects Mistral", async () => {
    const openAiFetch = vi.fn<RealtimeClientSecretFetch>(async () =>
      Response.json({
        expires_at: 1_800_000_000,
        value: "ek_test",
      })
    );
    const app = await createIsolatedApp({
      openAiRealtimeApiKey: () => "sk-server",
      openAiRealtimeFetch: openAiFetch,
      realtimeVoiceConfigResolver: async () => ({
        provider: "mistral",
      }),
      scopeResolver,
    });

    const res = await app.request("http://localhost/ai/v1/realtime/sessions", {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({
      error: "realtime.providerUnsupported",
    });
    expect(openAiFetch).not.toHaveBeenCalled();
  });
});
