import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServiceAccessToken,
  isServiceCredentialConfigured,
  resetServiceCredentialCache,
} from "../service-credential.js";

const ENV_KEYS = [
  "ENGENTY_AI_SERVICE_JWT",
  "ENGENTY_AI_SERVICE_SECRET",
  "ENGENTY_AI_SERVICE_EMAIL",
  "ENGENTY_AI_SERVICE_PASSWORD",
  "ENGENTY_CORE_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const saved = new Map<string, string | undefined>();

function loginResponse(token: string, expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn }),
    { headers: { "content-type": "application/json" }, status: 200 }
  );
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
  it("is false with nothing set and true for either form", () => {
    expect(isServiceCredentialConfigured()).toBe(false);
    process.env.ENGENTY_AI_SERVICE_JWT = "static";
    expect(isServiceCredentialConfigured()).toBe(true);
    delete process.env.ENGENTY_AI_SERVICE_JWT;
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    expect(isServiceCredentialConfigured()).toBe(true);
  });

  it("treats a password without an email as unconfigured", () => {
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    expect(isServiceCredentialConfigured()).toBe(false);
  });
});

describe("ENGENTY_AI_SERVICE_SECRET exchange", () => {
  function exchangeResponse(token: string, expiresIn = 900): Response {
    return new Response(JSON.stringify({ expiresIn, token }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }

  it("is configured by a well-formed secret and not by a malformed one", () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    expect(isServiceCredentialConfigured()).toBe(true);
    // No separator: an id with no secret must read as unconfigured rather than
    // producing a puzzling 401 from core.
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1";
    expect(isServiceCredentialConfigured()).toBe(false);
    process.env.ENGENTY_AI_SERVICE_SECRET = ".engsvc_abc";
    expect(isServiceCredentialConfigured()).toBe(false);
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

  it("takes precedence over the password grant", async () => {
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    process.env.ENGENTY_CORE_BASE_URL = "http://core.test";
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(exchangeResponse("from-exchange"));

    await expect(getServiceAccessToken()).resolves.toBe("from-exchange");
    // Supabase must not be contacted at all once a durable secret exists.
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("core.test");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("yields to the static JWT override", async () => {
    process.env.ENGENTY_AI_SERVICE_JWT = "static";
    process.env.ENGENTY_AI_SERVICE_SECRET = "cred-1.engsvc_abc";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(getServiceAccessToken()).resolves.toBe("static");
    expect(fetchSpy).not.toHaveBeenCalled();
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
});

describe("getServiceAccessToken", () => {
  it("returns null when nothing is configured", async () => {
    await expect(getServiceAccessToken()).resolves.toBeNull();
  });

  it("prefers the static JWT and performs no I/O for it", async () => {
    process.env.ENGENTY_AI_SERVICE_JWT = "static-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(getServiceAccessToken()).resolves.toBe("static-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("signs in with the password credential and caches the session", async () => {
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(loginResponse("minted-1"));

    await expect(getServiceAccessToken()).resolves.toBe("minted-1");
    await expect(getServiceAccessToken()).resolves.toBe("minted-1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "http://supabase.test/auth/v1/token?grant_type=password"
    );
  });

  it("re-mints once the cached token nears expiry", async () => {
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // First token expires in 60s — inside the 120s refresh margin, so the
      // second call must not reuse it.
      .mockResolvedValueOnce(loginResponse("short-lived", 60))
      .mockResolvedValueOnce(loginResponse("renewed"));

    await expect(getServiceAccessToken()).resolves.toBe("short-lived");
    await expect(getServiceAccessToken()).resolves.toBe("renewed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight sign-in across concurrent callers", async () => {
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(loginResponse("minted-once"));

    const tokens = await Promise.all([
      getServiceAccessToken(),
      getServiceAccessToken(),
      getServiceAccessToken(),
    ]);
    expect(tokens).toEqual(["minted-once", "minted-once", "minted-once"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws (rather than returning null) when a configured credential is rejected", async () => {
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "wrong";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 })
    );

    await expect(getServiceAccessToken()).rejects.toThrow(/HTTP 400/);
  });

  it("recovers after a failed sign-in instead of caching the failure", async () => {
    process.env.ENGENTY_AI_SERVICE_EMAIL = "service@engenty.local";
    process.env.ENGENTY_AI_SERVICE_PASSWORD = "pw";
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(loginResponse("after-retry"));

    await expect(getServiceAccessToken()).rejects.toThrow(/HTTP 500/);
    await expect(getServiceAccessToken()).resolves.toBe("after-retry");
  });
});
