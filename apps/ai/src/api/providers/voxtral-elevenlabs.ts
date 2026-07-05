import {
  type RealtimeSessionDescriptor,
  RealtimeSessionError,
  type RealtimeSessionRequest,
  type RealtimeSessionScope,
  type RealtimeVoiceProvider,
  type RealtimeVoiceTenantPrefs,
} from "@engenty/ai-core";
import { env } from "@engenty/telemetry";
import { mintCascadeTicket } from "../cascade/cascade-tickets.js";

const DEFAULT_STT_MODEL = "voxtral-mini-transcribe-realtime-2602";
const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
/** "Anton" placeholder — curate a real Austrian/Bavarian voice id in settings. */
const DEFAULT_TTS_VOICE = "";
const DEFAULT_LANGUAGE_HINT = "de-AT";

export interface CreateVoxtralElevenLabsProviderOptions {
  cascadeWsPath: string;
  elevenLabsApiKey?: () => string | null;
  mistralApiKey?: () => string | null;
  ticketSecret: string;
}

export function readMistralApiKeyFromEnv(): string | null {
  return env("MISTRAL_API_KEY", "") || null;
}

export function readElevenLabsApiKeyFromEnv(): string | null {
  return env("ELEVENLABS_API_KEY", "") || null;
}

/**
 * Cascade provider: Voxtral STT → tenant agent → ElevenLabs TTS. Unlike the
 * OpenAI provider it never talks to a vendor here — it mints a short-lived
 * WS ticket; the cascade broker (realtime-cascade-ws.ts) holds the vendor
 * connections server-side, so API keys never reach the browser.
 */
export function createVoxtralElevenLabsProvider({
  cascadeWsPath,
  elevenLabsApiKey = readElevenLabsApiKeyFromEnv,
  mistralApiKey = readMistralApiKeyFromEnv,
  ticketSecret,
}: CreateVoxtralElevenLabsProviderOptions): RealtimeVoiceProvider {
  return {
    id: "voxtral-elevenlabs",
    async createSession(
      scope: RealtimeSessionScope,
      request: RealtimeSessionRequest,
      prefs: RealtimeVoiceTenantPrefs | null
    ): Promise<RealtimeSessionDescriptor> {
      if (!(mistralApiKey() && elevenLabsApiKey())) {
        throw new RealtimeSessionError(503, "realtime.cascadeApiKeysMissing");
      }
      const sttModel =
        prefs?.voxtral_stt_model ??
        prefs?.mistral_stt_model ??
        DEFAULT_STT_MODEL;
      const ttsModel =
        prefs?.elevenlabs_tts_model ??
        prefs?.mistral_tts_model ??
        DEFAULT_TTS_MODEL;
      const ttsVoice =
        request.voice ?? prefs?.elevenlabs_voice_id ?? DEFAULT_TTS_VOICE;
      if (!ttsVoice) {
        throw new RealtimeSessionError(503, "realtime.cascadeVoiceMissing");
      }
      const languageHint = prefs?.voice_register ?? DEFAULT_LANGUAGE_HINT;
      const ticket = mintCascadeTicket(
        {
          instructions: request.instructions,
          language_hint: languageHint,
          stt_model: sttModel,
          tenant_id: scope.tenantId,
          tts_model: ttsModel,
          tts_voice: ttsVoice,
          user_id: scope.userId,
        },
        ticketSecret
      );
      return {
        kind: "server-cascade",
        provider: "voxtral-elevenlabs",
        ws_url: `${cascadeWsPath}?ticket=${encodeURIComponent(ticket)}`,
        stt_model: sttModel,
        tts_model: ttsModel,
        tts_voice: ttsVoice,
        language_hint: languageHint,
      };
    },
  };
}
