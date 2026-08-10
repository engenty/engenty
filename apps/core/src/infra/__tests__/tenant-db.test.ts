import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTenantDbFactory,
  resolveTenantDbConfig,
  SERVER_LANE_ROLE,
  SERVER_LANE_SUBJECT,
} from "../tenant-db.js";

/**
 * The lane has to sign with something the project's PostgREST will verify, and
 * that differs per environment: a shared secret locally, an imported EC key on
 * a Supabase Cloud project that has migrated to asymmetric signing. v0.1.113
 * shipped HS256-only and prod refused to boot, so both paths are pinned here —
 * including the half-configured case, which previously would have degraded to
 * HS256 and failed later with a message blaming the wrong thing.
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
  it("uses the symmetric secret when no private key is configured", () => {
    const config = resolveTenantDbConfig({
      ...BASE,
      securityJwtSecret: "stack-secret",
    });

    expect(config?.signingKey).toEqual({
      alg: "HS256",
      secret: "stack-secret",
    });
  });

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

  it("accepts the private key base64-encoded, for single-line env plumbing", () => {
    const config = resolveTenantDbConfig({
      ...BASE,
      serverLanePrivateKey: Buffer.from(pkcs8).toString("base64"),
      serverLaneKeyId: "lane-key-1",
    });

    expect(config?.signingKey).toMatchObject({ alg: "ES256" });
  });

  it("refuses a half-configured signing key instead of degrading to HS256", () => {
    expect(() =>
      resolveTenantDbConfig({
        ...BASE,
        securityJwtSecret: "stack-secret",
        serverLanePrivateKey: pkcs8,
      })
    ).toThrow(/half-configured/i);
  });

  it("returns null when nothing can sign at all", () => {
    expect(resolveTenantDbConfig(BASE)).toBeNull();
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

  it("still signs HS256 when that is what the stack verifies", async () => {
    const factory = createTenantDbFactory({
      url: BASE.supabaseUrl,
      anonKey: BASE.supabaseAnonKey,
      signingKey: { alg: "HS256", secret: "stack-secret" },
    });

    const client = factory.getTenantDb({ tenantId: "tenant-b" });
    const token = await (
      client as unknown as { accessToken: () => Promise<string> }
    ).accessToken();

    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode("stack-secret")
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(protectedHeader).not.toHaveProperty("kid");
    expect(payload.tenant_id).toBe("tenant-b");
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

  it("rejects an empty tenant rather than minting an unscoped token", () => {
    const factory = createTenantDbFactory({
      url: BASE.supabaseUrl,
      anonKey: BASE.supabaseAnonKey,
      signingKey: { alg: "HS256", secret: "s" },
    });

    expect(() => factory.getTenantDb({ tenantId: "  " })).toThrow(
      /non-empty tenantId/
    );
  });
});
