/**
 * Shared parsing for tenant `ai.config` JSON (tenant-settings key {@link TENANT_AI_CONFIG_KEY}).
 */

import {
  type AgentApprovalMode,
  parseAgentApprovalMode,
} from "@engenty/plugin-sdk";
import { modelIdOfRef } from "./config/model-ref.js";
import type { RealtimeVoiceTenantPrefs } from "./realtime/provider.js";

export {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  DEFAULT_AGENT_APPROVAL_MODES,
  parseAgentApprovalMode,
} from "@engenty/plugin-sdk";

export const TENANT_AI_CONFIG_KEY = "ai.config" as const;

export type BrowserParseProvider = "off" | "anydoc" | "liteparse";

export interface DocConverterTenantPrefs {
  /**
   * Chat-attachment extract in the browser before upload.
   * `null` / omitted inherits {@link resolveBrowserParse} (anydoc).
   */
  browser_parse?: BrowserParseProvider | null;
  gemini_model?: string | null;
  mistral_model?: string | null;
  provider?: "local" | "liteparse" | "llamaparse" | "mistral" | "gemini" | null;
}

/** Effective chat browser parser. Omitted / unknown → anydoc (current default). */
export function resolveBrowserParse(
  dc: DocConverterTenantPrefs | null | undefined
): BrowserParseProvider {
  const value = dc?.browser_parse;
  if (value === "off" || value === "anydoc" || value === "liteparse") {
    return value;
  }
  return "anydoc";
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

export interface AgentApprovalTenantPrefs {
  /**
   * Per-agent overrides keyed by agent type key (`engenty.coordinator`).
   * Each value is clamped to the tenant `mode` ceiling.
   */
  agents?: Record<string, AgentApprovalMode> | null;
  /** Tenant ceiling. Omitted → `manual`. */
  mode?: AgentApprovalMode | null;
}

function parseAgentApprovalPrefs(
  raw: unknown
): AgentApprovalTenantPrefs | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const mode = parseAgentApprovalMode(o.mode);
  const agentsRaw = o.agents;
  const agents: Record<string, AgentApprovalMode> = {};
  if (agentsRaw && typeof agentsRaw === "object" && !Array.isArray(agentsRaw)) {
    for (const [key, value] of Object.entries(
      agentsRaw as Record<string, unknown>
    )) {
      const parsed = parseAgentApprovalMode(value);
      if (parsed) {
        agents[key] = parsed;
      }
    }
  }
  return {
    mode,
    agents: Object.keys(agents).length > 0 ? agents : null,
  };
}

export interface TenantAiSettings {
  /**
   * How agents ask a human before running a capable-but-risky op.
   * Default when omitted: `manual`. Does not add capabilities.
   */
  agent_approval?: AgentApprovalTenantPrefs | null;
  caps?: AiCapsConfig | null;
  chat_model_id?: string | null;
  /** Pick-one-of-N questions (effort routing, inbox categories, guardrails). */
  classifier_model_id?: string | null;
  doc_converter?: DocConverterTenantPrefs | null;
  /** Short prose without tools (titles, summaries, starters, memory). */
  fast_text_model_id?: string | null;
  /**
   * Opt-in model-generated starter chips on specialist start pages.
   * Default off — a routing-tier call per page open is a real bill.
   */
  generated_starters?: boolean | null;
  /** Realtime voice provider + voice preferences. */
  realtime_voice?: RealtimeVoiceTenantPrefs | null;
  /**
   * IANA timezone the workspace works in, e.g. "Europe/Vienna".
   *
   * A container has no idea where its user is: it boots on UTC, so an agent
   * that reads its own clock reports UTC and every "good evening" is off by
   * the offset. This is the one place that says otherwise — it rides into the
   * sandbox as `TZ`, so `date` and `new Date()` answer in local time.
   *
   * Null means inherit UTC, which is what a container does anyway.
   */
  timezone?: string | null;
}

/**
 * Accepts a catalog model id, optionally carrying a gateway ref head
 * (`openrouter:openai/gpt-4o`). The `/` test is what rejects junk: every catalog
 * id is `provider/model`, so a value without one was never a model. It is
 * applied to the id half so a ref does not smuggle a malformed id past it.
 */
function parseGatewayModelId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  return modelIdOfRef(value).includes("/") ? value : null;
}

/**
 * An IANA zone name, validated by asking Intl to use it. Anything the runtime
 * would reject is dropped rather than stored: a bad `TZ` does not fail a
 * container, it silently leaves it on UTC, and a setting that looks saved but
 * does nothing is worse than an empty one.
 */
function parseTimezone(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
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
  const browser_parse = o.browser_parse;
  const normalizedProvider =
    provider === "local" ||
    provider === "liteparse" ||
    provider === "llamaparse" ||
    provider === "mistral" ||
    provider === "gemini"
      ? provider
      : null;
  const normalizedBrowserParse =
    browser_parse === "off" ||
    browser_parse === "anydoc" ||
    browser_parse === "liteparse"
      ? browser_parse
      : null;
  return {
    provider: normalizedProvider,
    browser_parse: normalizedBrowserParse,
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
    openai_transcription_model: trimmedOrNull(o.openai_transcription_model),
    openai_voice: trimmedOrNull(o.openai_voice),
    // Legacy mistral_* keys are read as fallbacks for one release.
    voxtral_stt_model:
      trimmedOrNull(o.voxtral_stt_model) ?? trimmedOrNull(o.mistral_stt_model),
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
  return {
    chat_model_id: parseGatewayModelId(o.chat_model_id),
    classifier_model_id: parseGatewayModelId(o.classifier_model_id),
    fast_text_model_id: parseGatewayModelId(o.fast_text_model_id),
    doc_converter: parseDocConverterPrefs(o.doc_converter),
    realtime_voice: parseRealtimeVoicePrefs(o.realtime_voice),
    caps: parseCaps(o.caps),
    agent_approval: parseAgentApprovalPrefs(o.agent_approval),
    generated_starters: o.generated_starters === true,
    timezone: parseTimezone(o.timezone),
  };
}
