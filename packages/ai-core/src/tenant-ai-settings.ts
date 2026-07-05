/**
 * Shared parsing for tenant `ai.config` JSON (tenant-settings key {@link TENANT_AI_CONFIG_KEY}).
 */

import type { RealtimeVoiceTenantPrefs } from "./realtime/provider.js";

export const TENANT_AI_CONFIG_KEY = "ai.config" as const;

export interface DocConverterTenantPrefs {
  gemini_model?: string | null;
  mistral_model?: string | null;
  provider?: "local" | "liteparse" | "llamaparse" | "mistral" | "gemini" | null;
}

/**
 * Tenant realtime-voice-agent preferences (OpenAI Realtime). Consumed by the
 * `/ai` realtime session route's voice-config resolver; null fields fall back to
 * the route defaults (gpt-realtime-2 / gpt-realtime-whisper / marin).
 */
export interface RealtimeVoiceTenantPrefs {
  openai_model?: string | null;
  openai_transcription_model?: string | null;
  openai_voice?: string | null;
  /** Only "openai" is served today; "mistral" is rejected (501) at the route. */
  provider?: "openai" | "mistral" | null;
}

/**
 * Tenant-level caps. Budget caps (soft/hard cost, per-user) live in the usage
 * policy store, not here — this carries only the tenant-default iteration cap.
 */
export interface AiCapsConfig {
  /**
   * Tenant default for max agent iterations (steps) per run.
   * null/undefined = inherit the platform default (env `ENGENTY_AI_AGENT_MAX_STEPS`, else 24).
   */
  max_steps?: number | null;
}

export interface TenantAiSettings {
  caps?: AiCapsConfig | null;
  chat_model_id?: string | null;
  /**
   * @deprecated Classifier had no runtime consumer; kept parse-tolerant for old
   * stored blobs only. Not surfaced in the UI.
   */
  classifier_model_id?: string | null;
  /** Routing / supervisor model (stored as `coordinator_model_id` for legacy compat). */
  coordinator_model_id?: string | null;
  doc_converter?: DocConverterTenantPrefs | null;
  /** Most-capable tier: planning, decomposition, sandboxed code execution. */
  planning_coding_model_id?: string | null;
  /** Realtime voice provider + voice preferences. */
  realtime_voice?: RealtimeVoiceTenantPrefs | null;
  /** Search / retrieval / deep-research tier. */
  research_model_id?: string | null;
  safeguard_model_id?: string | null;
}

function parseGatewayModelId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  return value.includes("/") ? value : null;
}

function parseDocConverterPrefs(raw: unknown): DocConverterTenantPrefs | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const gemini_model = o.gemini_model;
  const mistral_model = o.mistral_model;
  const normalizedProvider =
    provider === "local" ||
    provider === "liteparse" ||
    provider === "llamaparse" ||
    provider === "mistral" ||
    provider === "gemini"
      ? provider
      : null;
  return {
    provider: normalizedProvider,
    gemini_model:
      typeof gemini_model === "string" ? gemini_model.trim() || null : null,
    mistral_model:
      typeof mistral_model === "string" ? mistral_model.trim() || null : null,
  };
}

function trimmedOrNull(raw: unknown): string | null {
  return typeof raw === "string" ? raw.trim() || null : null;
}

function parseRealtimeVoicePrefs(
  raw: unknown
): RealtimeVoiceTenantPrefs | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const register = o.voice_register;
  return {
    provider:
      provider === "openai" ||
      provider === "voxtral-elevenlabs" ||
      provider === "mistral"
        ? provider
        : null,
    openai_model: trimmedOrNull(o.openai_model),
    openai_transcription_model: trimmedOrNull(
      o.openai_transcription_model
    ),
    openai_voice: trimmedOrNull(o.openai_voice),
    // Legacy mistral_* keys are read as fallbacks for one release.
    voxtral_stt_model:
      trimmedOrNull(o.voxtral_stt_model) ??
      trimmedOrNull(o.mistral_stt_model),
    elevenlabs_tts_model:
      trimmedOrNull(o.elevenlabs_tts_model) ??
      trimmedOrNull(o.mistral_tts_model),
    elevenlabs_voice_id: trimmedOrNull(o.elevenlabs_voice_id),
    voice_register:
      register === "de-AT" || register === "de-DE" || register === "de-CH"
        ? register
        : null,
  };
}


function parseCaps(raw: unknown): AiCapsConfig | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const rawSteps = o.max_steps;
  const steps =
    typeof rawSteps === "number" && Number.isFinite(rawSteps) && rawSteps > 0
      ? Math.floor(rawSteps)
      : null;
  return { max_steps: steps };
}
/**
 * Parse stored `ai.config` JSON value into a normalized shape.
 * Model settings are AI Gateway ids (`provider/model`); stale direct-provider
 * ids are ignored so app runtimes use their configured defaults.
 */
export function parseTenantAiSettings(raw: unknown): TenantAiSettings {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const routingModelId =
    parseGatewayModelId(o.routing_model_id) ??
    parseGatewayModelId(o.coordinator_model_id);
  return {
    chat_model_id: parseGatewayModelId(o.chat_model_id),
    coordinator_model_id: routingModelId,
    research_model_id: parseGatewayModelId(o.research_model_id),
    planning_coding_model_id: parseGatewayModelId(o.planning_coding_model_id),
    classifier_model_id: parseGatewayModelId(o.classifier_model_id),
    doc_converter: parseDocConverterPrefs(o.doc_converter),
    realtime_voice: parseRealtimeVoicePrefs(o.realtime_voice),
    safeguard_model_id: parseGatewayModelId(o.safeguard_model_id),
    caps: parseCaps(o.caps),
  };
}
