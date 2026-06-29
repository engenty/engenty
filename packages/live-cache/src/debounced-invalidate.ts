import type { QueryClient } from "@engenty/query-client";
import type { LiveQueryKey } from "./types.js";

export function createDebouncedInvalidator(
  queryClient: QueryClient,
  debounceMs = 150
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return function invalidateDebounced(queryKey: LiveQueryKey) {
    const key = JSON.stringify(queryKey);
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void queryClient.invalidateQueries({ queryKey });
      }, debounceMs)
    );
  };
}
