import type { ModuleLiveBinding } from "@engenty/live-cache";
import { companyProfileKeys } from "./queries.js";

/**
 * Reactive-data declaration for the company-profile module. The settings record
 * is a tenant singleton; the global Supabase Realtime mount refreshes it whenever
 * it changes (e.g. the company_profile research/manager agents, OpenAPI, CLI).
 */
export const companyProfileLiveBinding: ModuleLiveBinding = {
  id: "company-profile",
  queryRoot: companyProfileKeys.all,
  postgresChanges: [{ schema: "module_company_profile", table: "settings" }],
};
