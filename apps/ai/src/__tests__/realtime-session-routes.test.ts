import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import type { RealtimeClientSecretFetch } from "../api/realtime-session-routes.js";
import { type CreateAppOptions, createApp } from "../app.js";

const scopeResolver = createStaticAiScopeResolver({
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
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

  it("returns 503 when OpenAI API key is not configured", async () => {
    const app = await createIsolatedApp({
      openAiRealtimeApiKey: () => null,
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

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "realtime.openaiApiKeyMissing",
    });
  });

  it("mints an OpenAI realtime client secret without exposing the server key", async () => {
    const openAiFetch = vi.fn<RealtimeClientSecretFetch>(async () =>
      Response.json({
        expires_at: 1_800_000_000,
        value: "ek_test",
      })
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
      body: JSON.stringify({ instructions: "Help briefly", voice: "marin" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      kind: "webrtc-direct",
      provider: "openai",
      model: "gpt-realtime-2",
      transcription_model: "gpt-realtime-whisper",
      voice: "marin",
      client_secret: {
        expires_at: 1_800_000_000,
        value: "ek_test",
      },
    });
    expect(openAiFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-server",
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        method: "POST",
      })
    );
    const requestBody = JSON.parse(
      String((openAiFetch.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(requestBody).toEqual({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        audio: {
          input: { transcription: { model: "gpt-realtime-whisper" } },
          output: { voice: "marin" },
        },
        instructions: "Help briefly",
      },
    });
    expect(JSON.stringify(body)).not.toContain("sk-server");
    expect(JSON.stringify(openAiFetch.mock.calls[0]?.[1])).not.toContain(
      "00000000-0000-4000-8000-000000000001"
    );
    expect(JSON.stringify(openAiFetch.mock.calls[0]?.[1])).not.toContain(
      "00000000-0000-4000-8000-000000000002"
    );
  });

  it("uses tenant realtime voice OpenAI defaults when present", async () => {
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
        openai_transcription_model: "gpt-realtime-whisper",
        openai_voice: "cedar",
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
    await expect(res.json()).resolves.toMatchObject({
      model: "gpt-realtime-2",
      transcription_model: "gpt-realtime-whisper",
      voice: "cedar",
    });
    const requestBody = JSON.parse(
      String((openAiFetch.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(requestBody.session.audio.output.voice).toBe("cedar");
  });

  it("appends the tenant voice register to the session instructions", async () => {
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
        provider: "openai",
        voice_register: "de-AT",
      }),
      scopeResolver,
    });

    const res = await app.request("http://localhost/ai/v1/realtime/sessions", {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ instructions: "Help briefly" }),
    });

    expect(res.status).toBe(200);
    const requestBody = JSON.parse(
      String((openAiFetch.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(requestBody.session.instructions).toMatch(/^Help briefly\n\n/);
    expect(requestBody.session.instructions).toContain(
      "österreichisches Deutsch"
    );
    expect(requestBody.session.instructions).toContain("Jänner");
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

  it("rejects stale nested client secret responses from OpenAI", async () => {
    const openAiFetch = vi.fn<RealtimeClientSecretFetch>(async () =>
      Response.json({
        client_secret: {
          expires_at: 1_800_000_000,
          value: "ek_legacy_shape",
        },
      })
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

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "realtime.invalidClientSecretResponse",
    });
  });
});
