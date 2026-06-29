/**
 * A tiny, framework-agnostic registry for module extension points (member-detail
 * tabs, detail-page sections, …). Gives every bespoke module registry the same
 * ergonomics as core `register*` contributions — insert by `id`, iterate ordered
 * by `order` — instead of each one hand-rolling a `Map` + sort.
 *
 * Pure data: no React, no SDK coupling. Filtering/visibility stays the caller's
 * concern (layered over `getAll()`), since predicates are context-specific.
 *
 * Observable: extensions register lazily at plugin-init time, which can land
 * after a consumer has already rendered. `subscribe`/`getSnapshot` let React
 * consumers re-render on late registration via `useSyncExternalStore` (see
 * `useContributionRegistry`) instead of silently reading a stale set.
 */
export interface ContributionRegistry<
  T extends { id: string; order?: number },
> {
  /** Look up a single entry by `id`. */
  get(id: string): T | undefined;
  /** All entries, sorted ascending by `order` (missing `order` sorts as 0). */
  getAll(): T[];
  /**
   * Same ordered array as `getAll`, memoized so the reference is stable between
   * registrations — required for `useSyncExternalStore` to avoid render loops.
   */
  getSnapshot(): readonly T[];
  /** Register (or replace, by `id`) an entry. Idempotent. Notifies subscribers. */
  register(entry: T): void;
  /** Subscribe to registrations; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}

export function createContributionRegistry<
  T extends { id: string; order?: number },
>(): ContributionRegistry<T> {
  const entries = new Map<string, T>();
  const listeners = new Set<() => void>();
  // Cached, referentially-stable snapshot; invalidated on every register.
  let snapshot: readonly T[] | null = null;

  const rebuild = (): readonly T[] => {
    snapshot = [...entries.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    return snapshot;
  };

  return {
    register(entry) {
      entries.set(entry.id, entry);
      snapshot = null;
      for (const listener of listeners) {
        listener();
      }
    },
    get(id) {
      return entries.get(id);
    },
    getAll() {
      return [...(snapshot ?? rebuild())];
    },
    getSnapshot() {
      return snapshot ?? rebuild();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
