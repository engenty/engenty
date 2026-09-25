import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearReturnPath,
  peekReturnPath,
  rememberReturnPath,
} from "./return-path.js";

// Fails if: another origin (`//host`, a scheme) is kept and later navigated
// to; a stale path from a long-gone visit still hijacks a login; a login page
// is remembered and loops; a fresh path is lost.
describe("return path after login", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("brings a followed link back once, until cleared", () => {
    rememberReturnPath("/s/sales/workflows/abc?x=1");
    expect(peekReturnPath()).toBe("/s/sales/workflows/abc?x=1");
    clearReturnPath();
    expect(peekReturnPath()).toBeNull();
  });

  it("never keeps another origin or a login page", () => {
    for (const path of [
      "//evil.example/phish",
      "https://evil.example",
      "javascript:alert(1)",
      "/auth/login",
      "/",
    ]) {
      rememberReturnPath(path);
      expect(peekReturnPath()).toBeNull();
    }
  });

  it("forgets a link followed long before the login", () => {
    rememberReturnPath("/s/sales/workflows/abc");
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(peekReturnPath()).toBeNull();
  });
});
