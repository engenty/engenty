import type { ModuleLiveBinding } from "@engenty/live-cache";
import { commercialSettingsKeys } from "./queries.js";

/**
 * Reactive-data declaration for the commercial-settings module. The settings
 * record is a tenant singleton; the global Supabase Realtime mount refreshes it
 * whenever it changes — including from the copilot's
 * `commercial_settings_*_set` operations, which write through the backend and
 * never touch this page's query cache.
 */
export const commercialSettingsLiveBinding: ModuleLiveBinding = {
  // Invalidates as soon as the tool call resolves on the client, without
  // waiting for the realtime round trip — the copilot writing settings while
  // the user watches this page is the case that made the staleness visible.
  agentToolIds: [
    "commercial_settings_defaults_set",
    "commercial_settings_disciplines_set",
    "commercial_settings_expense_categories_set",
    "commercial_settings_tax_deduction_rules_set",
    "commercial_settings_tax_rates_set",
    "commercial_settings_units_set",
  ],
  id: "commercial-settings",
  postgresChanges: [
    { schema: "module_commercial_settings", table: "settings" },
  ],
  queryRoot: commercialSettingsKeys.all,
};
