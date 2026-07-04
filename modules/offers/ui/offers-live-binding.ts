import type { ModuleLiveBinding } from "@engenty/live-cache";
import { offerKeys } from "./queries.js";

/**
 * Reactive-data declaration for the offers module. The global Supabase Realtime
 * mount invalidates the offers query subtree when an offer or its blocks change —
 * regardless of writer (copilot agent, OpenAPI, CLI, other tab, background job).
 */
export const offersLiveBinding: ModuleLiveBinding = {
  id: "offers",
  queryRoot: offerKeys.all,
  postgresChanges: [
    { schema: "module_offers", table: "offers" },
    { schema: "module_offers", table: "offer_blocks" },
  ],
};
