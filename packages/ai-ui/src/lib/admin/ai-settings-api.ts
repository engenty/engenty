/**
 * AI settings persistence via tenant-settings KV.
 * Key: ai.config (JSON) for per-purpose model defaults + caps.
 *
 * A null/absent field means "inherit" (the platform role binding). The effective value +
 * provenance for display comes from GET /ai/v1/settings/effective; this module
 * only reads/writes the tenant-pinned layer.
 */

import type { AiCapsConfig } from "@engenty/ai-core/browser";
import { parseTenantAiSettings } from "@engenty/ai-core/browser";
import { request } from "./request";

export type {
  AiCapsConfig,
  BrowserParseProvider,
  DocConverterTenantPrefs,
  RealtimeVoiceTenantPrefs,
} from "@engenty/ai-core/browser";

export const AI_CONFIG_KEY = "ai.config";

export interface AiConfig {
  /**
   * How agents ask a human before running a capable-but-risky op.
   * Default when omitted: `manual`. Does not add capabilities.
   */
  agent_approval?:
    | import("@engenty/ai-core/browser").AgentApprovalTenantPrefs
    | null;
  /** Tenant-default caps (iteration cap). */
  caps?: AiCapsConfig | null;
  chat_model_id?: string | null;
  /**
   * Fast single-shot classification (inbox lanes / attachment triage).
   */
  classifier_model_id?: string | null;
  /** Knowledge-base document → markdown conversion preferences. */
  doc_converter?:
    | import("@engenty/ai-core/browser").DocConverterTenantPrefs
    | null;
  /** Short prose without tools: observational memory, titles, digests. */
  fast_text_model_id?: string | null;
  /**
   * Opt-in model-generated starter chips on specialist start pages.
   * Default off.
   */
  generated_starters?: boolean | null;
  /** Realtime voice provider + voice preferences. */
  realtime_voice?:
    | import("@engenty/ai-core/browser").RealtimeVoiceTenantPrefs
    | null;
  /**
   * IANA zone the workspace works in. Rides into every sandbox as `TZ`, so an
   * agent reading its own clock answers in local time instead of the
   * container's UTC. Null inherits UTC.
   */
  timezone?: string | null;
}

/** API may return wrapped { ok, data: { name, type, value } } or legacy { name, type, value }. */
type TenantSettingApiResponse =
  | { ok: true; data: { name: string; type: string; value?: unknown } }
  | { name?: string; type?: string; value?: unknown }
  | { error: string };

export async function getAiConfig(signal?: AbortSignal): Promise<AiConfig> {
  const res = await request<TenantSettingApiResponse>(
    `/api/tenant-settings/${encodeURIComponent(AI_CONFIG_KEY)}`,
    { signal }
  );
  if ("error" in res) {
    return {};
  }
  // Wrapped `{ ok, data }` vs legacy `{ name, type, value }` — narrow before
  // reading `.value` so DTS build accepts both shapes.
  const raw =
    "data" in res && res.data != null
      ? res.data.value
      : "value" in res
        ? res.value
        : undefined;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const parsed = parseTenantAiSettings(raw);
    return {
      chat_model_id: parsed.chat_model_id ?? null,
      classifier_model_id: parsed.classifier_model_id ?? null,
      fast_text_model_id: parsed.fast_text_model_id ?? null,
      doc_converter: parsed.doc_converter ?? null,
      realtime_voice: parsed.realtime_voice ?? null,
      caps: parsed.caps ?? null,
      agent_approval: parsed.agent_approval ?? null,
      generated_starters: parsed.generated_starters === true,
      timezone: parsed.timezone ?? null,
    };
  }
  return {};
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await request(`/api/tenant-settings/${encodeURIComponent(AI_CONFIG_KEY)}`, {
    method: "PATCH",
    body: JSON.stringify({
      type: "json",
      value_jsonb: {
        chat_model_id: config.chat_model_id ?? null,
        classifier_model_id: config.classifier_model_id ?? null,
        fast_text_model_id: config.fast_text_model_id ?? null,
        doc_converter: config.doc_converter ?? null,
        realtime_voice: config.realtime_voice ?? null,
        caps: config.caps ?? null,
        agent_approval: config.agent_approval ?? null,
        generated_starters: config.generated_starters === true,
        timezone: config.timezone ?? null,
      },
    }),
  });
}
