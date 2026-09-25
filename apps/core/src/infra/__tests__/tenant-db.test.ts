import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTenantDbFactory,
  resolveTenantDbConfig,
  SERVER_LANE_IAT_BACKDATE_SECONDS,
  SERVER_LANE_ROLE,
  SERVER_LANE_SUBJECT,
} from "../tenant-db.js";

/**
 * The lane signs with what the project's PostgREST verifies: a shared secret
 * locally, an EC key on a Supabase project using asymmetric signing.
 */

const BASE = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "anon-key",
};

let pkcs8: string;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  pkcs8 = await exportPKCS8(pair.privateKey);
  publicKey = pair.publicKey;
});

describe("resolveTenantDbConfig picks the signing algorithm", () => {
  it("prefers ES256 when a private key and key id are configured", () => {
    const config = resolveTenantDbConfig({
      ...BASE,
      // Present, and deliberately ignored in favour of the asymmetric key.
      securityJwtSecret: "stack-secret",
      serverLanePrivateKey: pkcs8,
      serverLaneKeyId: "lane-key-1",
    });

    expect(config?.signingKey).toMatchObject({
      alg: "ES256",
      kid: "lane-key-1",
    });
  });
});

describe("the minted token", () => {
  it("is ES256 with the configured kid, and verifies against the public key", async () => {
    const factory = createTenantDbFactory({
      url: BASE.supabaseUrl,
      anonKey: BASE.supabaseAnonKey,
      signingKey: { alg: "ES256", kid: "lane-key-1", privateKeyPem: pkcs8 },
    });

    // The token is only reachable through the accessToken provider the client
    // was built with — which is the contract supabase-js actually uses.
    const client = factory.getTenantDb({ tenantId: "tenant-a" });
    const token = await (
      client as unknown as { accessToken: () => Promise<string> }
    ).accessToken();

    const { payload, protectedHeader } = await jwtVerify(token, publicKey);
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "lane-key-1" });
    expect(payload.role).toBe(SERVER_LANE_ROLE);
    expect(payload.tenant_id).toBe("tenant-a");
    // Non-UUID subjects break every policy that casts `sub` to uuid.
    expect(payload.sub).toBe(SERVER_LANE_SUBJECT);
  });

  it("carries the tenant it was asked for, per tenant", async () => {
    const factory = createTenantDbFactory({
      url: BASE.supabaseUrl,
      anonKey: BASE.supabaseAnonKey,
      signingKey: { alg: "ES256", kid: "k", privateKeyPem: pkcs8 },
    });

    const read = async (tenantId: string) => {
      const client = factory.getTenantDb({ tenantId });
      const token = await (
        client as unknown as { accessToken: () => Promise<string> }
      ).accessToken();
      return (await jwtVerify(token, publicKey)).payload.tenant_id;
    };

    expect(await read("tenant-a")).toBe("tenant-a");
    expect(await read("tenant-b")).toBe("tenant-b");
  });

  it("backdates iat as clock-skew leeway, without shortening the token's life", async () => {
    const factory = createTenantDbFactory({
      url: BASE.supabaseUrl,
      anonKey: BASE.supabaseAnonKey,
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
    // PostgREST rejects an `iat` ~30s in its future (PGRST303) with no leeway
    // knob, so the mint must sit behind the minting clock.
    expect(SERVER_LANE_IAT_BACKDATE_SECONDS).toBeGreaterThanOrEqual(30);
    expect(payload.iat).toBeLessThanOrEqual(
      afterSeconds - SERVER_LANE_IAT_BACKDATE_SECONDS
    );
    expect(payload.iat).toBeGreaterThanOrEqual(
      beforeSeconds - SERVER_LANE_IAT_BACKDATE_SECONDS
    );
    // `exp` stays anchored to the real clock (10-min TTL), not the backdated iat.
    expect(payload.exp).toBeGreaterThanOrEqual(beforeSeconds + 600);
    expect(payload.exp).toBeLessThanOrEqual(afterSeconds + 600);
  });
});
