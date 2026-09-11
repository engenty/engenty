/** In-process LRU with TTL. Stale entries are returned for SWR, then refreshed. */

export interface TtlLruEntry<T> {
  stale: boolean;
  value: T;
}

export class TtlLruCache<T> {
  readonly #max: number;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #entries = new Map<string, { expiresAt: number; value: T }>();

  /** `now` is injectable so specs assert staleness without racing the clock. */
  constructor(max: number, ttlMs: number, now: () => number = Date.now) {
    this.#max = max;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  get(key: string): TtlLruEntry<T> | undefined {
    const entry = this.#entries.get(key);
    if (!entry) {
      return;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return {
      stale: this.#now() >= entry.expiresAt,
      value: entry.value,
    };
  }

  set(key: string, value: T): void {
    if (this.#entries.has(key)) {
      this.#entries.delete(key);
    } else if (this.#entries.size >= this.#max) {
      const oldest = this.#entries.keys().next().value;
      if (typeof oldest === "string") {
        this.#entries.delete(oldest);
      }
    }
    this.#entries.set(key, { expiresAt: this.#now() + this.#ttlMs, value });
  }

  clear(): void {
    this.#entries.clear();
  }
}
