/**
 * Shared parsing for tenant `ai.config` JSON (tenant-settings key {@link TENANT_AI_CONFIG_KEY}).
 */

export const TENANT_AI_CONFIG_KEY = "ai.config" as const;

export interface DocConverterTenantPrefs {
  gemini_model?: string | null;
  provider?: "local" | "liteparse" | "llamaparse" | "gemini" | null;
}

export interface TenantAiSettings {
  chat_model_id?: string | null;
  classifier_model_id?: string | null;
  /** Routing / supervisor model (stored as `coordinator_model_id` for legacy compat). */
  coordinator_model_id?: string | null;
  doc_converter?: DocConverterTenantPrefs | null;
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
  const normalizedProvider =
    provider === "local" ||
    provider === "liteparse" ||
    provider === "llamaparse" ||
    provider === "gemini"
      ? provider
      : null;
  return {
    provider: normalizedProvider,
    gemini_model:
      typeof gemini_model === "string" ? gemini_model.trim() || null : null,
  };
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
    classifier_model_id: parseGatewayModelId(o.classifier_model_id),
    doc_converter: parseDocConverterPrefs(o.doc_converter),
    safeguard_model_id: parseGatewayModelId(o.safeguard_model_id),
  };
}
