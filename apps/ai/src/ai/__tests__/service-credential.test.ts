import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServiceAccessToken,
  isServiceCredentialConfigured,
  resetServiceCredentialCache,
} from "../service-credential.js";

const ENV_KEYS = [
  "ENGENTY_AI_SERVICE_SECRET",
  "ENGENTY_CORE_BASE_URL",
] as const;

const saved = new Map<string, string | undefined>();

function exchangeResponse(token: string, expiresIn = 900): Response {
  return new Response(JSON.stringify({ expiresIn, token }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  resetServiceCredentialCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
  resetServiceCredentialCache();
});

describe("isServiceCredentialConfigured", () => {
  it("is false with nothing set and true for a well-formed secret", () => {
    expect(isServiceCredentialConfigured()).toBe(false);
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    expect(isServiceCredentialConfigured()).toBe(true);
  });

  it("treats a malformed secret as unconfigured", () => {
    // No separator: an id with no secret must read as unconfigured rather than
    // producing a puzzling 401 from core.
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1";
    expect(isServiceCredentialConfigured()).toBe(false);
    process.env.ENGENTY_AI_SERVICE_SECRET = ".engsvc_abc";
    expect(isServiceCredentialConfigured()).toBe(false);
  });
});

describe("getServiceAccessToken", () => {
  it("returns null when nothing is configured", async () => {
    await expect(getServiceAccessToken()).resolves.toBeNull();
  });

  it("posts both halves to core and caches the minted token", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(exchangeResponse("engenty-service-token"));

    await expect(getServiceAccessToken()).resolves.toBe(
      "engenty-service-token"
    );
    await expect(getServiceAccessToken()).resolves.toBe(
      "engenty-service-token"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "http://core.test/api/auth/service-token"
    );
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      credentialId: "cred-1",
      secret: "engsvc_abc",
    });
  });

  it("keeps a secret containing dots intact after the first separator", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.a.b.c";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(exchangeResponse("t"));
    await getServiceAccessToken();
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body)).secret).toBe("a.b.c");
  });

  it("mints and caches per tenant", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(exchangeResponse("token-a"))
      .mockResolvedValueOnce(exchangeResponse("token-b"));

    await expect(getServiceAccessToken({ tenantId: "tenant-a" })).resolves.toBe(
      "token-a"
    );
    await expect(getServiceAccessToken({ tenantId: "tenant-b" })).resolves.toBe(
      "token-b"
    );
    // Each tenant's session is cached independently.
    await expect(getServiceAccessToken({ tenantId: "tenant-a" })).resolves.toBe(
      "token-a"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(firstBody.tenantId).toBe("tenant-a");
  });

  it("throws when core rejects the credential", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.wrong";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":"invalid_client"}', { status: 401 })
    );
    await expect(getServiceAccessToken()).rejects.toThrow(/HTTP 401/);
  });

  it("re-mints inside the refresh margin", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 60s left is inside the 120s margin, so the second call re-mints.
      .mockResolvedValueOnce(exchangeResponse("short", 60))
      .mockResolvedValueOnce(exchangeResponse("renewed"));
    await expect(getServiceAccessToken()).resolves.toBe("short");
    await expect(getServiceAccessToken()).resolves.toBe("renewed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight exchange across concurrent callers", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(exchangeResponse("minted-once"));

    const tokens = await Promise.all([
      getServiceAccessToken(),
      getServiceAccessToken(),
      getServiceAccessToken(),
    ]);
    expect(tokens).toEqual(["minted-once", "minted-once", "minted-once"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("recovers after a failed exchange instead of caching the failure", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(exchangeResponse("after-retry"));

    await expect(getServiceAccessToken()).rejects.toThrow(/HTTP 500/);
    await expect(getServiceAccessToken()).resolves.toBe("after-retry");
  });
});
