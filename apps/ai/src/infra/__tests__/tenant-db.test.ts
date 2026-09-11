import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import {
  createTenantDbFactory,
  SERVER_LANE_IAT_BACKDATE_SECONDS,
} from "../tenant-db.js";

/**
 * apps/ai's tenant-db is a replica of apps/core/src/infra/tenant-db.ts (see
 * the file header); core's suite is the source of truth for the full minting
 * contract. This pins the one regression the replica must not drift on: the
 * clock-skew leeway. PostgREST rejects `iat` more than ~30s in ITS future
 * (PGRST303 "JWT issued at future") with no leeway knob, so a minter clock
 * ahead of the database container — a Docker VM lagging after host sleep —
 * took down every scheduled trigger fire until the clocks reconverged.
 */
describe("the minted server-lane token (replica of apps/core)", () => {
  it("backdates iat as clock-skew leeway, without shortening the token's life", async () => {
    const factory = createTenantDbFactory({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      signingKey: { alg: "HS256", secret: "stack-secret" },
    });

    const beforeSeconds = Math.floor(Date.now() / 1000);
    const client = factory.getTenantDb({ tenantId: "tenant-skew" });
    const token = await (
      client as unknown as { accessToken: () => Promise<string> }
    ).accessToken();
    const afterSeconds = Math.ceil(Date.now() / 1000);

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode("stack-secret")
    );
    expect(SERVER_LANE_IAT_BACKDATE_SECONDS).toBeGreaterThanOrEqual(30);
    expect(payload.iat).toBeLessThanOrEqual(
      afterSeconds - SERVER_LANE_IAT_BACKDATE_SECONDS
    );
    expect(payload.iat).toBeGreaterThanOrEqual(
      beforeSeconds - SERVER_LANE_IAT_BACKDATE_SECONDS
    );
    // `exp` stays anchored to the real clock (10-min TTL): the leeway widens
    // the validity window backwards only.
    expect(payload.exp).toBeGreaterThanOrEqual(beforeSeconds + 600);
    expect(payload.exp).toBeLessThanOrEqual(afterSeconds + 600);
  });
});
