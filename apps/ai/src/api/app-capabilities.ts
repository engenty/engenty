import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque capability handles for engenty App backends.
 *
 * An App backend has no browser and must not hold a bearer token. Actor tokens
 * are not an option: `POST /api/auth/actor-token` mints a token carrying the
 * target user's ENTIRE grant set, and no server-side mechanism anywhere
 * restricts a caller to a declared set of operation ids — everything named
 * "grant" in this codebase widens rather than restricts. Handing one to
 * tenant-authored code would be handing over the user's session.
 *
 * So a backend gets one of these instead: 32 random bytes that mean nothing
 * anywhere except at this process's app proxy, where they resolve to
 * (user token, app, allowed operations) and expire in minutes.
 *
 * A handle must NOT be a JWT signed with ENGENTY_SECURITY_JWT_SECRET:
 * `verifyAccessToken` accepts any HS256 token carrying tenant_id + sub as an
 * ordinary access token, so a signed handle would be a full session token by
 * accident.
 *
 * v1 keeps the registry in-process. That is a deliberate trade, not an
 * oversight: resolving from Postgres would require apps/ai to hold a service
 * credential on exactly the path that must never have one. The cost is that a
 * restart invalidates outstanding handles and a second replica cannot resolve
 * a peer's — both of which fail CLOSED. `module_apps.app_capability` is where
 * this moves when apps/ai runs multi-replica.
 */

export interface AppCapabilityGrant {
  allowedOperations: readonly string[];
  appId: string;
  sessionId: string;
  tenantId: string;
  userAccessToken: string;
  userId: string;
}

interface StoredGrant extends AppCapabilityGrant {
  expiresAtMs: number;
}

/** Upper bound on a handle's life. Short enough that leakage has a horizon. */
export const CAPABILITY_TTL_MS = 300_000;

function hashHandle(handle: string): string {
  return createHash("sha256").update(handle, "utf8").digest("hex");
}

export class AppCapabilityRegistry {
  private readonly grants = new Map<string, StoredGrant>();

  private readonly ttlMs: number;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? CAPABILITY_TTL_MS;
  }

  /** Mint a handle. The plaintext is returned once and never stored. */
  mint(grant: AppCapabilityGrant, nowMs = Date.now()): string {
    this.sweep(nowMs);
    const handle = randomBytes(32).toString("base64url");
    this.grants.set(hashHandle(handle), {
      ...grant,
      expiresAtMs: nowMs + this.ttlMs,
    });
    return handle;
  }

  /** Resolve a presented handle, or null when unknown or expired. */
  resolve(handle: string, nowMs = Date.now()): AppCapabilityGrant | null {
    if (!handle) {
      return null;
    }
    const digest = hashHandle(handle);
    const stored = this.grants.get(digest);
    if (!stored) {
      return null;
    }
    if (stored.expiresAtMs <= nowMs) {
      this.grants.delete(digest);
      return null;
    }
    // Constant-time confirmation of the key we just looked up. The Map lookup
    // above is already an equality test, so this is belt-and-braces against a
    // future change that compares handles directly.
    const expected = Buffer.from(digest, "utf8");
    const presented = Buffer.from(hashHandle(handle), "utf8");
    if (
      expected.length !== presented.length ||
      !timingSafeEqual(expected, presented)
    ) {
      return null;
    }
    return {
      allowedOperations: stored.allowedOperations,
      appId: stored.appId,
      sessionId: stored.sessionId,
      tenantId: stored.tenantId,
      userAccessToken: stored.userAccessToken,
      userId: stored.userId,
    };
  }

  revoke(handle: string): void {
    this.grants.delete(hashHandle(handle));
  }

  /** Drop everything issued for an app — the per-app kill switch. */
  revokeApp(appId: string): number {
    let removed = 0;
    for (const [digest, grant] of this.grants) {
      if (grant.appId === appId) {
        this.grants.delete(digest);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.grants.size;
  }

  private sweep(nowMs: number): void {
    for (const [digest, grant] of this.grants) {
      if (grant.expiresAtMs <= nowMs) {
        this.grants.delete(digest);
      }
    }
  }
}

export const appCapabilities = new AppCapabilityRegistry();
