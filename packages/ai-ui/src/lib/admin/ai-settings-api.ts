/**
 * AI settings persistence via tenant-settings KV.
 * Keys: ai.config (JSON) for chat/routing/classifier model defaults.
 */

import {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
  parseTenantAiSettings,
} from "@engenty/ai-core/browser";
import { request } from "./request";

export type { DocConverterTenantPrefs } from "@engenty/ai-core/browser";

export const AI_CONFIG_KEY = "ai.config";

export interface AiConfig {
  chat_model_id?: string | null;
  /** Fast single-shot model for classification (inbox attachment scan). */
  classifier_model_id?: string | null;
  /** Routing / supervisor model (`coordinator_model_id` in stored JSON for legacy compat). */
  coordinator_model_id?: string | null;
  /** Knowledge-base document → markdown conversion preferences. */
  doc_converter?:
    | import("@engenty/ai-core/browser").DocConverterTenantPrefs
    | null;
}

export const DEFAULT_CHAT_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
/** @deprecated Use {@link DEFAULT_ROUTING_MODEL}. */
export const DEFAULT_COORDINATOR_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
export const DEFAULT_ROUTING_MODEL = DEFAULT_AI_CHAT_MODEL_ID;
/** Small / non-reasoning models work best for one-call document type classification. */
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
  const payload = "data" in res && res.data != null ? res.data : res;
  const raw = payload.value;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const parsed = parseTenantAiSettings(raw);
    return {
      chat_model_id: parsed.chat_model_id ?? null,
      coordinator_model_id: parsed.coordinator_model_id ?? null,
      classifier_model_id: parsed.classifier_model_id ?? null,
      doc_converter: parsed.doc_converter ?? null,
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
        classifier_model_id: config.classifier_model_id ?? null,
        doc_converter: config.doc_converter ?? null,
      },
    }),
  });
}
