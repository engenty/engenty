// Resolve the model used for inbox classification, digests, and thread chat.
//
// Chain: tenant `ai.config.classifier_model_id`
//   → platform `classifier` binding (installation)
//   → env (`AI_INBOX_DIGEST_MODEL` / `AI_CLASSIFIER_MODEL`)
//   → package default (`DEFAULT_AI_CLASSIFIER_MODEL_ID`)
//
// Not `model.low` — that graded effort role is general low-effort chat/agents.

import {
  bindingsFromList,
  type ModelBindings,
  parseTenantAiSettings,
  resolvePurposeModelId,
  TENANT_AI_CONFIG_KEY,
} from "@engenty/ai-core";
import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { env } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolveInboxAiModelOptions {
  auth: PluginAuthContext;
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  /** Service-role client — needed to read platform `ai.model_binding`. */
  serviceDb?: SupabaseClient | null;
}

async function loadTenantClassifierModelId(
  getDb: ResolveInboxAiModelOptions["getDb"],
  auth: PluginAuthContext
): Promise<string | null> {
  try {
    const repo = createTenantSettingsRepoSupabase(
      getDb(auth),
      auth.tenantId,
      auth.scopeId ?? "default"
    );
    const row = await repo.get(TENANT_AI_CONFIG_KEY);
    const tenantAi = parseTenantAiSettings(row?.value);
    return tenantAi.classifier_model_id?.trim() || null;
  } catch {
    return null;
  }
}

async function loadPlatformBindings(
  serviceDb: SupabaseClient | null | undefined
): Promise<ModelBindings | undefined> {
  if (!serviceDb) {
    return;
  }
  try {
    const { data, error } = await serviceDb
      .schema("ai")
      .from("model_binding")
      .select("gateway, model_id, role")
      .eq("scope", "platform");
    if (error || !data || data.length === 0) {
      return;
    }
    return bindingsFromList(
      data.map((row) => ({
        gateway: String(row.gateway ?? "vercel"),
        modelId: String(row.model_id),
        role: String(row.role),
      }))
    );
  } catch {
    return;
  }
}

/** Effective classifier-tier model for this tenant / installation. */
export async function resolveInboxAiModel(
  options: ResolveInboxAiModelOptions
): Promise<string> {
  const [tenantDefault, bindings] = await Promise.all([
    loadTenantClassifierModelId(options.getDb, options.auth),
    loadPlatformBindings(options.serviceDb),
  ]);
  return resolvePurposeModelId({
    purpose: "classifier",
    tenantDefault,
    ...(bindings ? { bindings } : {}),
    readEnv: (key) => env(key),
  });
}
