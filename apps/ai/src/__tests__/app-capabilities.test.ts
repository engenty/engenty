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
  userAccessToken: "user-jwt",
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
