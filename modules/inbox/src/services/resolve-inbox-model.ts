// Resolve the model used for inbox digests, thread summaries and thread chat —
// short text without tools, so the `fast_text` role. Category classification
// does not come through here (it uses the classifier client).
//
// Chain: tenant `ai.config.fast_text_model_id` → platform `fast_text` binding.

import {
  parseTenantAiSettings,
  resolveChatModelId,
  TENANT_AI_CONFIG_KEY,
} from "@engenty/ai-core";
import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolveInboxAiModelOptions {
  auth: PluginAuthContext;
  getDb: (auth: { tenantId: string }) => SupabaseClient;
}

async function loadTenantFastTextModelId(
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
    return tenantAi.fast_text_model_id?.trim() || null;
  } catch {
    return null;
  }
}

/** Effective fast-text model for this tenant / installation. */
export async function resolveInboxAiModel(
  options: ResolveInboxAiModelOptions
): Promise<string> {
  const tenantDefault = await loadTenantFastTextModelId(
    options.getDb,
    options.auth
  );
  return resolveChatModelId({ purpose: "fast_text", tenantDefault });
}
