import { describe, expect, it } from "vitest";
import { parseTenantAiSettings } from "./tenant-ai-settings";

describe("parseTenantAiSettings", () => {
  it("keeps gateway model ids and trims whitespace", () => {
    expect(
      parseTenantAiSettings({
        chat_model_id: " openai/fixture-chat ",
        classifier_model_id: "openai/fixture-classifier",
        coordinator_model_id: "anthropic/fixture-coordinator",
      })
    ).toMatchObject({
      chat_model_id: "openai/fixture-chat",
      classifier_model_id: "openai/fixture-classifier",
      coordinator_model_id: "anthropic/fixture-coordinator",
    });
  });

  it("ignores stale bare provider model ids", () => {
    expect(
      parseTenantAiSettings({
        chat_model_id: "gpt-5.3-chat",
        coordinator_model_id: "gpt-5.3-chat",
      })
    ).toMatchObject({
      chat_model_id: null,
      coordinator_model_id: null,
    });
  });

  it("accepts routing_model_id and prefers it over coordinator_model_id", () => {
    expect(
      parseTenantAiSettings({
        routing_model_id: "openai/fixture-routing",
        coordinator_model_id: "anthropic/fixture-coordinator",
      })
    ).toMatchObject({
      coordinator_model_id: "openai/fixture-routing",
    });
  });

  it("falls back from routing_model_id to coordinator_model_id", () => {
    expect(
      parseTenantAiSettings({
        coordinator_model_id: "openai/fixture-coordinator",
      })
    ).toMatchObject({
      coordinator_model_id: "openai/fixture-coordinator",
    });
  });

  it("parses realtime_voice prefs and normalizes an unknown provider to null", () => {
    expect(
      parseTenantAiSettings({
        realtime_voice: {
          provider: "openai",
          openai_model: " gpt-realtime-2 ",
          openai_voice: "cedar",
          openai_transcription_model: "",
        },
      }).realtime_voice
    ).toEqual({
      elevenlabs_tts_model: null,
      elevenlabs_voice_id: null,
      openai_model: "gpt-realtime-2",
      openai_transcription_model: null,
      openai_voice: "cedar",
      provider: "openai",
      voice_register: null,
      voxtral_stt_model: null,
    });
    expect(
      parseTenantAiSettings({ realtime_voice: { provider: "nope" } })
        .realtime_voice
    ).toMatchObject({ provider: null });
  });

  it("keeps the voxtral-elevenlabs provider and its cascade fields", () => {
    expect(
      parseTenantAiSettings({
        realtime_voice: {
          elevenlabs_voice_id: " austrian-voice ",
          provider: "voxtral-elevenlabs",
          voice_register: "de-AT",
          voxtral_stt_model: "voxtral-mini-transcribe-realtime-2602",
        },
      }).realtime_voice
    ).toMatchObject({
      elevenlabs_voice_id: "austrian-voice",
      provider: "voxtral-elevenlabs",
      voice_register: "de-AT",
      voxtral_stt_model: "voxtral-mini-transcribe-realtime-2602",
    });
  });

  it("reads the legacy mistral_* keys as cascade fallbacks", () => {
    expect(
      parseTenantAiSettings({
        realtime_voice: {
          mistral_stt_model: "legacy-stt",
          mistral_tts_model: "legacy-tts",
          provider: "mistral",
        },
      }).realtime_voice
    ).toMatchObject({
      elevenlabs_tts_model: "legacy-tts",
      provider: "mistral",
      voxtral_stt_model: "legacy-stt",
    });
  });

  it("rejects an unknown voice register", () => {
    expect(
      parseTenantAiSettings({
        realtime_voice: { voice_register: "de-XX" },
      }).realtime_voice
    ).toMatchObject({ voice_register: null });
  });
});
