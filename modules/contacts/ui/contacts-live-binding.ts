import type { ModuleLiveBinding } from "@engenty/live-cache";
import { contactKeys } from "./queries.js";

/**
 * Reactive-data declaration for the contacts module. The global Supabase Realtime
 * mount invalidates the contacts query subtree whenever a contact row changes —
 * regardless of writer (copilot agent, OpenAPI, CLI, other tab, background job).
 * Realtime-only: contacts writes stay within module_contacts, so no agent-tool
 * intent map is needed (see modules/projects for the cross-module case).
 */
export const contactsLiveBinding: ModuleLiveBinding = {
  id: "contacts",
  queryRoot: contactKeys.all,
  postgresChanges: [
    { schema: "module_contacts", table: "contacts" },
    { schema: "module_contacts", table: "contact_relations" },
    // Agent-notes card: entity-scoped memory records render on the contact
    // page; an agent writing a memory mid-view refreshes the card live.
    { schema: "module_memory", table: "records" },
  ],
};
