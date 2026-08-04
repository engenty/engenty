import { describe, expect, it } from "vitest";
import {
  AppCapabilityRegistry,
  CAPABILITY_TTL_MS,
} from "../api/app-capabilities.js";

const grant = {
  allowedOperations: ["inbox_threads_list"],
  appId: "app-1",
  sessionId: "sess-1",
  tenantId: "tenant-1",
  accessToken: "user-jwt",
  userId: "user-1",
};

describe("AppCapabilityRegistry", () => {
  it("resolves a freshly minted handle to its grant", () => {
    const registry = new AppCapabilityRegistry();
    const handle = registry.mint(grant);
    expect(registry.resolve(handle)).toEqual(grant);
  });

  it("mints a distinct opaque handle every time", () => {
    const registry = new AppCapabilityRegistry();
    const a = registry.mint(grant);
    const b = registry.mint(grant);
    expect(a).not.toBe(b);
    // Opaque: nothing about the user, tenant or app is recoverable from it.
    expect(a).not.toContain("app-1");
    expect(a).not.toContain("tenant-1");
    expect(a).not.toContain("user-jwt");
  });

  it("is not a JWT — it must never be accepted as a session token", () => {
    const registry = new AppCapabilityRegistry();
    const handle = registry.mint(grant);
    // verifyAccessToken accepts any HS256 token carrying tenant_id + sub, so a
    // signed handle would be a full session token by accident. base64url
    // random bytes cannot parse as a three-segment JWT.
    expect(handle.split(".")).toHaveLength(1);
  });

  it("expires a handle at its TTL", () => {
    const registry = new AppCapabilityRegistry({ ttlMs: 1000 });
    const now = 1_000_000;
    const handle = registry.mint(grant, now);
    expect(registry.resolve(handle, now + 999)).not.toBeNull();
    expect(registry.resolve(handle, now + 1000)).toBeNull();
  });

  it("defaults to a five-minute ceiling", () => {
    expect(CAPABILITY_TTL_MS).toBe(300_000);
    const registry = new AppCapabilityRegistry();
    const now = 1_000_000;
    const handle = registry.mint(grant, now);
    expect(registry.resolve(handle, now + CAPABILITY_TTL_MS)).toBeNull();
  });

  it("returns null for an unknown handle", () => {
    const registry = new AppCapabilityRegistry();
    expect(registry.resolve("not-a-real-handle")).toBeNull();
    expect(registry.resolve("")).toBeNull();
  });

  it("revokes a single handle without touching its siblings", () => {
    const registry = new AppCapabilityRegistry();
    const a = registry.mint(grant);
    const b = registry.mint(grant);
    registry.revoke(a);
    expect(registry.resolve(a)).toBeNull();
    expect(registry.resolve(b)).not.toBeNull();
  });

  it("revokes every handle for one app — the per-app kill switch", () => {
    const registry = new AppCapabilityRegistry();
    const mine = registry.mint(grant);
    const other = registry.mint({ ...grant, appId: "app-2" });
    expect(registry.revokeApp("app-1")).toBe(1);
    expect(registry.resolve(mine)).toBeNull();
    expect(registry.resolve(other)).not.toBeNull();
  });

  it("sweeps expired handles rather than growing without bound", () => {
    const registry = new AppCapabilityRegistry({ ttlMs: 1000 });
    const now = 1_000_000;
    registry.mint(grant, now);
    registry.mint(grant, now);
    expect(registry.size()).toBe(2);
    registry.mint(grant, now + 2000);
    expect(registry.size()).toBe(1);
  });
});

/**
 * A handle must never outlive the token it captured. With 1-hour Supabase
 * sessions the 5-minute TTL was always the binding constraint; 15-minute
 * engenty service tokens make it possible for the captured credential to
 * expire first, which would fail silently at the App backend.
 */
describe("AppCapabilityRegistry — handle life is clamped to the token's", () => {
  const NOW = 1_700_000_000_000;

  function jwtExpiringAt(epochSeconds: number): string {
    const payload = Buffer.from(
      JSON.stringify({ exp: epochSeconds, sub: "svc" }),
      "utf8"
    ).toString("base64url");
    return `header.${payload}.signature`;
  }

  it("clamps to the token's remaining life when that is shorter than the TTL", () => {
    const registry = new AppCapabilityRegistry();
    // 90s of token left, against a 300s handle TTL.
    const token = jwtExpiringAt(Math.floor(NOW / 1000) + 90);
    const handle = registry.mint({ ...grant, accessToken: token }, NOW);

    expect(registry.resolve(handle, NOW + 89_000)).not.toBeNull();
    expect(registry.resolve(handle, NOW + 91_000)).toBeNull();
  });

  it("keeps the full TTL when the token outlives it", () => {
    const registry = new AppCapabilityRegistry();
    const token = jwtExpiringAt(Math.floor(NOW / 1000) + 3600);
    const handle = registry.mint({ ...grant, accessToken: token }, NOW);

    expect(
      registry.resolve(handle, NOW + CAPABILITY_TTL_MS - 1)
    ).not.toBeNull();
    expect(registry.resolve(handle, NOW + CAPABILITY_TTL_MS)).toBeNull();
  });

  it("keeps the full TTL for a token with no readable expiry", () => {
    const registry = new AppCapabilityRegistry();
    // Opaque tokens (and anything that isn't a JWT) behave exactly as before.
    const handle = registry.mint({ ...grant, accessToken: "opaque" }, NOW);
    expect(
      registry.resolve(handle, NOW + CAPABILITY_TTL_MS - 1)
    ).not.toBeNull();
  });

  it("refuses a handle minted from an already-expired token", () => {
    const registry = new AppCapabilityRegistry();
    const token = jwtExpiringAt(Math.floor(NOW / 1000) - 10);
    const handle = registry.mint({ ...grant, accessToken: token }, NOW);
    expect(registry.resolve(handle, NOW)).toBeNull();
  });
});
