/**
 * Catalog + vendor lookup for Settings → AI → Voice dropdowns.
 * Static lists for STT/TTS model ids; ElevenLabs voices are fetched with the
 * platform key so the browser never sees credentials.
 */

export interface RealtimeVoiceOption {
  id: string;
  label: string;
  /** Optional secondary labels (accent, language, category). */
  meta?: string | null;
}

export interface RealtimeVoiceOptionsResponse {
  cascade_keys_configured: boolean;
  elevenlabs_tts_models: RealtimeVoiceOption[];
  elevenlabs_voices: RealtimeVoiceOption[];
  elevenlabs_voices_error: string | null;
  openai_models: RealtimeVoiceOption[];
  openai_transcription_models: RealtimeVoiceOption[];
  openai_voices: RealtimeVoiceOption[];
  voxtral_stt_models: RealtimeVoiceOption[];
}

export const VOXTRAL_STT_MODEL_OPTIONS: RealtimeVoiceOption[] = [
  {
    id: "voxtral-mini-transcribe-realtime-2602",
    label: "voxtral-mini-transcribe-realtime-2602",
  },
];

export const ELEVENLABS_TTS_MODEL_OPTIONS: RealtimeVoiceOption[] = [
  { id: "eleven_flash_v2_5", label: "eleven_flash_v2_5 (low latency)" },
  { id: "eleven_turbo_v2_5", label: "eleven_turbo_v2_5" },
  { id: "eleven_multilingual_v2", label: "eleven_multilingual_v2" },
];

export const OPENAI_REALTIME_MODEL_OPTIONS: RealtimeVoiceOption[] = [
  { id: "gpt-realtime-2", label: "gpt-realtime-2" },
];

export const OPENAI_TRANSCRIPTION_MODEL_OPTIONS: RealtimeVoiceOption[] = [
  { id: "gpt-realtime-whisper", label: "gpt-realtime-whisper" },
];

/** Voices documented for the OpenAI Realtime API. */
export const OPENAI_REALTIME_VOICE_OPTIONS: RealtimeVoiceOption[] = [
  { id: "marin", label: "marin" },
  { id: "cedar", label: "cedar" },
  { id: "alloy", label: "alloy" },
  { id: "ash", label: "ash" },
  { id: "ballad", label: "ballad" },
  { id: "coral", label: "coral" },
  { id: "echo", label: "echo" },
  { id: "sage", label: "sage" },
  { id: "shimmer", label: "shimmer" },
  { id: "verse", label: "verse" },
];

const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";

export type ElevenLabsVoicesFetch = typeof fetch;

export async function fetchElevenLabsVoiceOptions(opts: {
  apiKey: string;
  fetchImpl?: ElevenLabsVoicesFetch;
}): Promise<{
  error: string | null;
  voices: RealtimeVoiceOption[];
}> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${ELEVENLABS_VOICES_URL}?show_legacy=true`, {
      headers: { "xi-api-key": opts.apiKey },
    });
    if (!res.ok) {
      let detailBody = "";
      try {
        detailBody = await res.text();
      } catch {
        detailBody = "";
      }
      const permissionDenied =
        detailBody.includes("missing_permissions") ||
        detailBody.includes("voices_read");
      return {
        error: permissionDenied
          ? "realtime.elevenLabsApiKeyMissingPermissions"
          : res.status === 401 || res.status === 403
            ? "realtime.elevenLabsApiKeyInvalid"
            : "realtime.elevenLabsVoicesUnavailable",
        voices: [],
      };
    }
    const payload = (await res.json()) as {
      voices?: Array<{
        category?: string;
        labels?: Record<string, string>;
        name?: string;
        voice_id?: string;
      }>;
    };
    const voices = (payload.voices ?? [])
      .filter(
        (voice): voice is { name: string; voice_id: string } & typeof voice =>
          typeof voice.voice_id === "string" &&
          voice.voice_id.length > 0 &&
          typeof voice.name === "string" &&
          voice.name.length > 0
      )
      .map((voice) => {
        const metaParts = [
          voice.labels?.accent,
          voice.labels?.language,
          voice.category,
        ].filter((part): part is string => Boolean(part?.trim()));
        return {
          id: voice.voice_id,
          label: voice.name,
          meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    return { error: null, voices };
  } catch {
    return { error: "realtime.elevenLabsVoicesUnavailable", voices: [] };
  }
}

export async function buildRealtimeVoiceOptions(opts: {
  elevenLabsApiKey: string | null;
  fetchImpl?: ElevenLabsVoicesFetch;
  mistralApiKey: string | null;
}): Promise<RealtimeVoiceOptionsResponse> {
  const cascade_keys_configured = Boolean(
    opts.mistralApiKey && opts.elevenLabsApiKey
  );
  let elevenlabs_voices: RealtimeVoiceOption[] = [];
  let elevenlabs_voices_error: string | null = null;

  if (opts.elevenLabsApiKey) {
    const fetched = await fetchElevenLabsVoiceOptions({
      apiKey: opts.elevenLabsApiKey,
      fetchImpl: opts.fetchImpl,
    });
    elevenlabs_voices = fetched.voices;
    elevenlabs_voices_error = fetched.error;
  } else {
    elevenlabs_voices_error = "realtime.elevenLabsApiKeyMissing";
  }

  return {
    cascade_keys_configured,
    elevenlabs_tts_models: ELEVENLABS_TTS_MODEL_OPTIONS,
    elevenlabs_voices,
    elevenlabs_voices_error,
    openai_models: OPENAI_REALTIME_MODEL_OPTIONS,
    openai_transcription_models: OPENAI_TRANSCRIPTION_MODEL_OPTIONS,
    openai_voices: OPENAI_REALTIME_VOICE_OPTIONS,
    voxtral_stt_models: VOXTRAL_STT_MODEL_OPTIONS,
  };
}
