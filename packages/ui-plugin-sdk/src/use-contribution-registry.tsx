import { useSyncExternalStore } from "react";
import type { ContributionRegistry } from "./contribution-registry.js";

/**
 * Reactively read every entry of a contribution registry. Re-renders when an
 * extension registers late (e.g. a plugin's tab registered after this consumer
 * first mounted), so contributed items never silently go missing.
 *
 * Filtering/visibility stays the caller's concern — layer it over the result.
 */
export function useContributionRegistry<
  T extends { id: string; order?: number },
>(registry: ContributionRegistry<T>): readonly T[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot
  );
}
