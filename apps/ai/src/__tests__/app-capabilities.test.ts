import { describe, expect, it } from "vitest";
import { AppCapabilityRegistry } from "../api/app-capabilities.js";

const grant = {
  allowedOperations: ["inbox_threads_list"],
  appId: "app-1",
  sessionId: "sess-1",
  tenantId: "tenant-1",
  accessToken: "user-jwt",
  userId: "user-1",
};

describe("AppCapabilityRegistry", () => {
  it("mints a distinct opaque handle every time", () => {
    const registry = new AppCapabilityRegistry();
    const a = registry.mint(grant);
    const b = registry.mint(grant);
    expect(a).not.toBe(b);
    expect(a).not.toContain("app-1");
    expect(a).not.toContain("tenant-1");
    expect(a).not.toContain("user-jwt");
  });

  it("is not a JWT — it must never be accepted as a session token", () => {
    // verifyAccessToken accepts any HS256 token carrying tenant_id + sub.
    const registry = new AppCapabilityRegistry();
    const handle = registry.mint(grant);
    expect(handle.split(".")).toHaveLength(1);
  });

  it("expires a handle at its TTL", () => {
    const registry = new AppCapabilityRegistry({ ttlMs: 1000 });
    const now = 1_000_000;
    const handle = registry.mint(grant, now);
    expect(registry.resolve(handle, now + 999)).not.toBeNull();
    expect(registry.resolve(handle, now + 1000)).toBeNull();
  });
});

// A handle must never outlive the token it captured, or it fails silently at the App backend.
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
    const token = jwtExpiringAt(Math.floor(NOW / 1000) + 90);
    const handle = registry.mint({ ...grant, accessToken: token }, NOW);

    expect(registry.resolve(handle, NOW + 89_000)).not.toBeNull();
    expect(registry.resolve(handle, NOW + 91_000)).toBeNull();
  });

  it("refuses a handle minted from an already-expired token", () => {
    const registry = new AppCapabilityRegistry();
    const token = jwtExpiringAt(Math.floor(NOW / 1000) - 10);
    const handle = registry.mint({ ...grant, accessToken: token }, NOW);
    expect(registry.resolve(handle, NOW)).toBeNull();
  });
});
