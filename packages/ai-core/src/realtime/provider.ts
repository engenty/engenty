/**
 * Realtime voice provider abstraction.
 *
 * Providers differ in *session shape*, not just vendor: OpenAI Realtime is
 * speech-to-speech over a direct browser↔vendor WebRTC connection, while
 * cascade providers (Voxtral STT → agent → ElevenLabs TTS) run server-side
 * behind a WebSocket we broker. `RealtimeSessionDescriptor` is a tagged union
 * over those shapes; the frontend picks its transport from `kind`.
 *
 * Wire format is snake_case — descriptors are serialized as-is by the
 * session route and consumed by `packages/ai-ui` transports.
 */

export type RealtimeProviderId = "openai" | "voxtral-elevenlabs";

/** Legacy tenant-prefs value from the earlier stub; maps to voxtral-elevenlabs. */
export type LegacyRealtimeProviderId = "mistral";

export function normalizeRealtimeProviderId(
  provider: string | null | undefined
): RealtimeProviderId {
  if (provider === "voxtral-elevenlabs" || provider === "mistral") {
    return "voxtral-elevenlabs";
  }
  return "openai";
}

/**
 * Tenant-level realtime voice preferences (stored in tenant-settings KV).
 * `mistral_*` keys are the legacy spelling of the cascade fields and are
 * still read for one release; new writes use `voxtral_*` / `elevenlabs_*`.
 */
export interface RealtimeVoiceTenantPrefs {
  elevenlabs_tts_model?: string | null;
  elevenlabs_voice_id?: string | null;
  /** @deprecated the cascade uses the tenant chat agent, not a vendor chat model. */
  mistral_chat_model?: string | null;
  /** @deprecated legacy cascade keys — read-only fallback for voxtral_stt_model. */
  mistral_stt_model?: string | null;
  /** @deprecated legacy cascade keys — read-only fallback for elevenlabs_tts_model. */
  mistral_tts_model?: string | null;
  openai_model?: string | null;
  openai_transcription_model?: string | null;
  openai_voice?: string | null;
  provider?: RealtimeProviderId | LegacyRealtimeProviderId | null;
  /** Regional German register applied to agent instructions (word choice). */
  voice_register?: "de-AT" | "de-DE" | "de-CH" | null;
  voxtral_stt_model?: string | null;
}

export interface RealtimeSessionScope {
  tenantId: string;
  userId: string;
  visitorId?: string;
}

export interface RealtimeSessionRequest {
  instructions?: string;
  model?: string;
  voice?: string;
}

/** Direct browser↔vendor WebRTC session (OpenAI speech-to-speech). */
export interface RealtimeWebRtcDirectSession {
  client_secret: {
    expires_at: number | null;
    value: string;
  };
  kind: "webrtc-direct";
  model: string;
  provider: "openai";
  transcription_model: string;
  voice: string;
}

/** Server-brokered cascade session (STT → agent → TTS over our WebSocket). */
export interface RealtimeServerCascadeSession {
  kind: "server-cascade";
  language_hint?: string;
  provider: "voxtral-elevenlabs";
  stt_model: string;
  tts_model: string;
  tts_voice: string;
  ws_url: string;
}

export type RealtimeSessionDescriptor =
  | RealtimeWebRtcDirectSession
  | RealtimeServerCascadeSession;

/**
 * Provider-signalled session failure. The session route maps `status`/`code`
 * onto the HTTP response (`{ error: code, message? }`), so providers never
 * touch Hono directly.
 */
export class RealtimeSessionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "RealtimeSessionError";
    this.status = status;
    this.code = code;
  }
}

export interface RealtimeVoiceProvider {
  createSession(
    scope: RealtimeSessionScope,
    request: RealtimeSessionRequest,
    prefs: RealtimeVoiceTenantPrefs | null
  ): Promise<RealtimeSessionDescriptor>;
  readonly id: RealtimeProviderId;
}
