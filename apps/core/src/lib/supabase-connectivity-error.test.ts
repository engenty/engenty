import { describe, expect, it } from "vitest";
import { isLikelySupabaseConnectivityFailure } from "./supabase-connectivity-error.js";

describe("isLikelySupabaseConnectivityFailure", () => {
  it("detects nested network causes", () => {
    const err = new Error("upstream");
    Object.assign(err, {
      cause: new TypeError("fetch failed"),
    });
    expect(isLikelySupabaseConnectivityFailure(err)).toBe(true);
  });

  it("returns false for arbitrary errors", () => {
    expect(isLikelySupabaseConnectivityFailure(new Error("bad input"))).toBe(
      false
    );
  });
});
