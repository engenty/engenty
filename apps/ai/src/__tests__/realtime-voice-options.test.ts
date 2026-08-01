import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import {
  buildRealtimeVoiceOptions,
  ELEVENLABS_TTS_MODEL_OPTIONS,
  VOXTRAL_STT_MODEL_OPTIONS,
} from "../api/realtime-voice-options.js";
import { type CreateAppOptions, createApp } from "../app.js";

const scopeResolver = createStaticAiScopeResolver({
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
});

function createIsolatedApp(options: CreateAppOptions = {}) {
  return createApp({
    agentRunStore: null,
    agentSessionStore: null,
    disableGatewayModelScheduler: true,
    registryStore: null,
    realtimeVoiceConfigResolver: null,
    usageStore: null,
    ...options,
  });
}

describe("buildRealtimeVoiceOptions", () => {
  it("returns curated model lists and marks cascade keys", async () => {
    const body = await buildRealtimeVoiceOptions({
      elevenLabsApiKey: null,
      mistralApiKey: "mistral-test",
    });
    expect(body.cascade_keys_configured).toBe(false);
    expect(body.voxtral_stt_models).toEqual(VOXTRAL_STT_MODEL_OPTIONS);
    expect(body.elevenlabs_tts_models).toEqual(ELEVENLABS_TTS_MODEL_OPTIONS);
    expect(body.elevenlabs_voices_error).toBe(
      "realtime.elevenLabsApiKeyMissing"
    );
    expect(body.elevenlabs_voices).toEqual([]);
  });

  it("maps ElevenLabs voices and sorts by name", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        voices: [
          {
            voice_id: "z-voice",
            name: "Zeta",
            category: "premade",
            labels: { accent: "american", language: "en" },
          },
          {
            voice_id: "a-voice",
            name: "Anton",
            category: "cloned",
            labels: { accent: "austrian", language: "de" },
          },
        ],
      })
    );
    const body = await buildRealtimeVoiceOptions({
      elevenLabsApiKey: "el-test",
      fetchImpl,
      mistralApiKey: "mistral-test",
    });
    expect(body.cascade_keys_configured).toBe(true);
    expect(body.elevenlabs_voices_error).toBeNull();
    expect(body.elevenlabs_voices.map((voice) => voice.id)).toEqual([
      "a-voice",
      "z-voice",
    ]);
    expect(body.elevenlabs_voices[0]).toMatchObject({
      id: "a-voice",
      label: "Anton",
      meta: "austrian · de · cloned",
    });
  });

  it("surfaces an invalid-key error from ElevenLabs", async () => {
    const body = await buildRealtimeVoiceOptions({
      elevenLabsApiKey: "bad",
      fetchImpl: async () => new Response("nope", { status: 401 }),
      mistralApiKey: "mistral-test",
    });
    expect(body.elevenlabs_voices).toEqual([]);
    expect(body.elevenlabs_voices_error).toBe(
      "realtime.elevenLabsApiKeyInvalid"
    );
  });

  it("surfaces a missing-permissions error from ElevenLabs", async () => {
    const body = await buildRealtimeVoiceOptions({
      elevenLabsApiKey: "restricted",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            detail: {
              status: "missing_permissions",
              message:
                "The API key you used is missing the permission voices_read",
            },
          }),
          { status: 401 }
        ),
      mistralApiKey: "mistral-test",
    });
    expect(body.elevenlabs_voices_error).toBe(
      "realtime.elevenLabsApiKeyMissingPermissions"
    );
  });
});

describe("realtime voice-options route", () => {
  it("requires authenticated AI scope", async () => {
    const app = await createIsolatedApp({
      scopeResolver: async () => ({
        error: "agent_threads.unauthorized",
        ok: false,
        status: 401,
      }),
    });
    const res = await app.request(
      "http://localhost/ai/v1/realtime/voice-options"
    );
    expect(res.status).toBe(401);
  });

  it("returns the catalog for an authenticated caller", async () => {
    const app = await createIsolatedApp({
      elevenLabsRealtimeApiKey: () => "el-test",
      elevenLabsVoicesFetch: async () =>
        Response.json({
          voices: [{ voice_id: "v1", name: "Voice One", labels: {} }],
        }),
      mistralRealtimeApiKey: () => "mistral-test",
      scopeResolver,
    });
    const res = await app.request(
      "http://localhost/ai/v1/realtime/voice-options",
      {
        headers: { Authorization: "Bearer test-token" },
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cascade_keys_configured).toBe(true);
    expect(body.elevenlabs_voices).toEqual([
      { id: "v1", label: "Voice One", meta: null },
    ]);
    expect(body.voxtral_stt_models[0]?.id).toBe(
      "voxtral-mini-transcribe-realtime-2602"
    );
  });
});
