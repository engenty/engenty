import { describe, expect, it } from "vitest";
import { TtlLruCache } from "../starter-cache.js";

describe("TtlLruCache", () => {
  it("evicts the least recently used entry", () => {
    let clock = 0;
    const cache = new TtlLruCache<string>(2, 1000, () => clock);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")?.value).toBe("B");
    expect(cache.get("b")?.stale).toBe(false);
    clock = 500;
    expect(cache.get("b")?.stale).toBe(false);
  });

  it("keeps a read entry alive and evicts the one not read", () => {
    const clock = 0;
    const cache = new TtlLruCache<string>(2, 1000, () => clock);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.get("a");
    cache.set("c", "C");
    expect(cache.get("a")?.value).toBe("A");
    expect(cache.get("b")).toBeUndefined();
  });

  it("reports staleness once the ttl has passed, still returning the value", () => {
    let clock = 0;
    const cache = new TtlLruCache<string>(2, 1000, () => clock);
    cache.set("a", "A");
    clock = 1000;
    const entry = cache.get("a");
    expect(entry?.value).toBe("A");
    expect(entry?.stale).toBe(true);
  });
});
