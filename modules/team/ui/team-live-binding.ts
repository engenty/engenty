import type { ModuleLiveBinding } from "@engenty/live-cache";

/**
 * Reactive-data declaration for the team module. The global Supabase Realtime
 * mount invalidates the team query subtree when a member profile changes — so
 * a profile edit in one window (or via OpenAPI/CLI/agent) refreshes every
 * other open window with no reload. Root is the literal ["team"] so it covers
 * all team query namespaces (members, global-settings, module).
 *
 * Only tables this module's own migrations create AND add to the
 * `supabase_realtime` publication belong here. The HR tables (employees,
 * contracts, gallery photos) are owned by the separate team-hr module, which
 * must register its own live binding — listing a table that is missing from
 * the publication makes realtime reject the subscription.
 */
export const teamLiveBinding: ModuleLiveBinding = {
  id: "team",
  queryRoot: ["team"],
  postgresChanges: [{ schema: "module_team", table: "profiles" }],
};
