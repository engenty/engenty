import {
  buildAgentToolInvalidationMap,
  type LiveCacheBinding,
  type ModuleLiveBinding,
  toLiveCacheBindings,
} from "@engenty/live-cache";
import type { UiLiveBindingContribution } from "@engenty/ui-plugin-sdk";
import { settingsLiveCacheBindings } from "./settings-live-bindings";
import { spaceKeys } from "./spaces-queries";

/**
 * The agent-management surface is app-owned, not a module: hiring a
 * specialist or giving it a routine changes the SPACE — the sidebar roster,
 * the surface, the Plan tab — and none of that has a module plugin to
 * contribute the binding. Without this, "the Bookkeeping Agent is now active"
 * was true in the database and false in the sidebar until a page reload.
 */
const agentManagementBindings: readonly ModuleLiveBinding[] = [
  {
    agentToolIds: [
      "agent_propose",
      "routines_create",
      "routines_update",
      "routines_run",
    ],
    id: "space-agent-management",
    queryRoot: spaceKeys.all,
  },
];

/**
 * Assemble the app's two reactive-data layers from the live bindings each
 * installed module contributes (`UiLiveBindingContribution`, structurally a
 * `ModuleLiveBinding`) plus the app-owned core settings bindings. Replaces the
 * old hand-maintained static import list so a module that isn't installed
 * simply drops out — no apps/ui edit required.
 */
export function buildLiveBindingMaps(
  contributedBindings: readonly UiLiveBindingContribution[]
): {
  agentToolInvalidationMap: ReturnType<typeof buildAgentToolInvalidationMap>;
  liveCacheBindings: LiveCacheBinding[];
} {
  const moduleBindings: readonly ModuleLiveBinding[] = contributedBindings;
  return {
    agentToolInvalidationMap: buildAgentToolInvalidationMap([
      ...moduleBindings,
      ...agentManagementBindings,
    ]),
    liveCacheBindings: [
      ...toLiveCacheBindings(moduleBindings),
      ...settingsLiveCacheBindings,
    ],
  };
}
