import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  resolveOAuth2Credentials,
} from "./oauth2.js";
import type { ConnectorDefinition, ConnectorOAuth2Config } from "./types.js";

const baseOAuth2: ConnectorOAuth2Config = {
  authUrl: "https://provider.example/oauth/authorize",
  baseScopes: ["profile"],
  tokenUrl: "https://provider.example/oauth/token",
};

function oauth2Connector(oauth2: ConnectorOAuth2Config): ConnectorDefinition {
  return {
    actions: [],
    auth: { kind: "oauth2", oauth2 },
    description: "test",
    id: "test-connector",
    moduleId: "connections-test",
    name: "Test",
    toolPrefix: "test",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveOAuth2Credentials", () => {
  it("resolves from the env pair", async () => {
    vi.stubEnv("TEST_OAUTH_ID", "env-id");
    vi.stubEnv("TEST_OAUTH_SECRET", "env-secret");
    const creds = await resolveOAuth2Credentials({
      ...baseOAuth2,
      clientIdEnv: "TEST_OAUTH_ID",
      clientSecretEnv: "TEST_OAUTH_SECRET",
    });
    expect(creds).toEqual({ clientId: "env-id", clientSecret: "env-secret" });
  });

  it("prefers resolveClientCredentials over the env pair", async () => {
    vi.stubEnv("TEST_OAUTH_ID", "env-id");
    vi.stubEnv("TEST_OAUTH_SECRET", "env-secret");
    const creds = await resolveOAuth2Credentials({
      ...baseOAuth2,
      clientIdEnv: "TEST_OAUTH_ID",
      clientSecretEnv: "TEST_OAUTH_SECRET",
      resolveClientCredentials: () =>
        Promise.resolve({ clientId: "db-id", clientSecret: "db-secret" }),
    });
    expect(creds).toEqual({ clientId: "db-id", clientSecret: "db-secret" });
  });

  it("throws a clear error when neither mechanism is configured", async () => {
    await expect(resolveOAuth2Credentials(baseOAuth2)).rejects.toThrow(
      /OAuth client credentials missing/u
    );
  });
});

describe("buildAuthorizationUrl", () => {
  it("uses DB-resolved credentials in the authorization URL", async () => {
    const url = await buildAuthorizationUrl({
      connector: oauth2Connector({
        ...baseOAuth2,
        resolveClientCredentials: () =>
          Promise.resolve({ clientId: "db-id", clientSecret: "db-secret" }),
      }),
      redirectUri: "https://engenty.example/api/connections/oauth/callback",
      scopes: ["profile", "email"],
      state: "nonce-1",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("db-id");
    expect(parsed.searchParams.get("scope")).toBe("profile email");
    expect(parsed.searchParams.get("state")).toBe("nonce-1");
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts DB-resolved client credentials to the token endpoint", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "at-1",
            expires_in: 3600,
            refresh_token: "rt-1",
            scope: "profile",
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
    ) as unknown as typeof fetch;
    const tokens = await exchangeAuthorizationCode({
      code: "code-1",
      config: {
        ...baseOAuth2,
        resolveClientCredentials: () =>
          Promise.resolve({ clientId: "db-id", clientSecret: "db-secret" }),
      },
      fetchImpl,
      redirectUri: "https://engenty.example/cb",
    });
    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.refreshToken).toBe("rt-1");
    const body = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.body;
    expect(String(body)).toContain("client_id=db-id");
    expect(String(body)).toContain("client_secret=db-secret");
  });
});
