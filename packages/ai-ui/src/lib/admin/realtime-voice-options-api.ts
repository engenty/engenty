// Client for GET /ai/v1/realtime/voice-options — curated model lists +
// ElevenLabs voices proxied through apps/ai (platform key never reaches the UI).

import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

export interface RealtimeVoiceOption {
  id: string;
  label: string;
  meta?: string | null;
}

export interface RealtimeVoiceOptions {
  cascade_keys_configured: boolean;
  elevenlabs_tts_models: RealtimeVoiceOption[];
  elevenlabs_voices: RealtimeVoiceOption[];
  elevenlabs_voices_error: string | null;
  openai_models: RealtimeVoiceOption[];
  openai_transcription_models: RealtimeVoiceOption[];
  openai_voices: RealtimeVoiceOption[];
  voxtral_stt_models: RealtimeVoiceOption[];
}

export async function getRealtimeVoiceOptions(
  signal?: AbortSignal
): Promise<RealtimeVoiceOptions> {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return await requestApiJson<RealtimeVoiceOptions>(
    "/ai/v1/realtime/voice-options",
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
}
