import {
  buildAgentToolInvalidationMap,
  type LiveCacheBinding,
  type ModuleLiveBinding,
  toLiveCacheBindings,
} from "@engenty/live-cache";
import type { UiLiveBindingContribution } from "@engenty/ui-plugin-sdk";
import { settingsLiveCacheBindings } from "./settings-live-bindings";

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
    agentToolInvalidationMap: buildAgentToolInvalidationMap(moduleBindings),
    liveCacheBindings: [
      ...toLiveCacheBindings(moduleBindings),
      ...settingsLiveCacheBindings,
    ],
  };
}
