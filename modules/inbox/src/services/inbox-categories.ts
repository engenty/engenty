// Tenant-configurable inbox categories (menu + classifier rules).
//
// Storage: tenant-settings key `inbox.categories` → `{ items: [...] }`.
// `messages.ai_category` stays unconstrained text; the app allowlist is this
// catalog. Fixed slugs are always re-injected on merge (locked, not deletable).

import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INBOX_CATEGORIES_SETTING_KEY,
  type InboxCategoriesConfig,
  mergeInboxCategories,
} from "../schema/categories.js";

export interface LoadInboxCategoriesOptions {
  auth: PluginAuthContext;
  getDb: (auth: { tenantId: string }) => SupabaseClient;
}

/** Load + merge tenant category catalog (falls back to defaults). */
export async function loadInboxCategories(
  options: LoadInboxCategoriesOptions
): Promise<InboxCategoriesConfig> {
  try {
    const repo = createTenantSettingsRepoSupabase(
      options.getDb(options.auth),
      options.auth.tenantId,
      options.auth.scopeId ?? "default"
    );
    const row = await repo.get(INBOX_CATEGORIES_SETTING_KEY);
    return mergeInboxCategories(row?.value);
  } catch {
    return mergeInboxCategories(null);
  }
}
