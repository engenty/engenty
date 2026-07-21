/**
 * AI settings persistence via tenant-settings KV.
 * Key: ai.config (JSON) for per-purpose model defaults + caps.
 *
 * A null/absent field means "inherit" (platform default). The effective value +
 * provenance for display comes from GET /ai/v1/settings/effective; this module
 * only reads/writes the tenant-pinned layer.
 */

import type { AiCapsConfig } from "@engenty/ai-core/browser";
import {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  parseTenantAiSettings,
} from "@engenty/ai-core/browser";
import { request } from "./request";

export type {
  AiCapsConfig,
  DocConverterTenantPrefs,
  RealtimeVoiceTenantPrefs,
} from "@engenty/ai-core/browser";

export const AI_CONFIG_KEY = "ai.config";

export interface AiConfig {
  /** Tenant-default caps (iteration cap). */
  caps?: AiCapsConfig | null;
  chat_model_id?: string | null;
  /**
   * @deprecated No runtime consumer; kept parse-tolerant for old stored blobs.
   */
  classifier_model_id?: string | null;
  /** Routing / supervisor model (`coordinator_model_id` in stored JSON for legacy compat). */
  coordinator_model_id?: string | null;
  /** Knowledge-base document → markdown conversion preferences. */
  doc_converter?:
    | import("@engenty/ai-core/browser").DocConverterTenantPrefs
    | null;
  /** Most-capable tier: planning, decomposition, sandboxed code execution. */
  planning_coding_model_id?: string | null;
  /** Realtime voice agent (OpenAI Realtime) preferences. */
  realtime_voice?:
    | import("@engenty/ai-core/browser").RealtimeVoiceTenantPrefs
    | null;
  /** Search / retrieval / deep-research tier. */
  research_model_id?: string | null;
  /** Guardrail-processor safeguard model. */
  safeguard_model_id?: string | null;
}

export const DEFAULT_CHAT_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
/** @deprecated Use {@link DEFAULT_ROUTING_MODEL}. */
export const DEFAULT_COORDINATOR_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
export const DEFAULT_ROUTING_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
/** @deprecated Classifier is retired; kept for import compatibility. */
export const DEFAULT_CLASSIFIER_MODEL = DEFAULT_AI_CLASSIFIER_MODEL_ID;

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
      coordinator_model_id: parsed.coordinator_model_id ?? null,
      research_model_id: parsed.research_model_id ?? null,
      planning_coding_model_id: parsed.planning_coding_model_id ?? null,
      safeguard_model_id: parsed.safeguard_model_id ?? null,
      classifier_model_id: parsed.classifier_model_id ?? null,
      doc_converter: parsed.doc_converter ?? null,
      realtime_voice: parsed.realtime_voice ?? null,
      caps: parsed.caps ?? null,
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
        coordinator_model_id: config.coordinator_model_id ?? null,
        research_model_id: config.research_model_id ?? null,
        planning_coding_model_id: config.planning_coding_model_id ?? null,
        safeguard_model_id: config.safeguard_model_id ?? null,
        doc_converter: config.doc_converter ?? null,
        realtime_voice: config.realtime_voice ?? null,
        caps: config.caps ?? null,
      },
    }),
  });
}
