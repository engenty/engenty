import type { ModuleLiveBinding } from "@engenty/live-cache";

/**
 * Reactive-data declaration for the team module. The global Supabase Realtime
 * mount invalidates the team query subtree when a member profile / employee
 * record / contract / gallery photo changes — so a profile edit in one window
 * (or via OpenAPI/CLI/agent) refreshes every other open window with no reload.
 * Root is the literal ["team"] so it covers all team query namespaces
 * (members, global-settings, module).
 */
export const teamLiveBinding: ModuleLiveBinding = {
  id: "team",
  queryRoot: ["team"],
  postgresChanges: [
    { schema: "module_team", table: "profiles" },
    { schema: "module_team", table: "employees" },
    { schema: "module_team", table: "team_member_contracts" },
    { schema: "module_team", table: "team_member_gallery_photos" },
  ],
};
