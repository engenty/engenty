import { afterEach, describe, expect, it } from "vitest";
import {
  expandPlaceholders,
  isProviderRejectedRedirectHost,
  loopbackRedirectUri,
  publicApiBaseUrl,
  resolveOAuthRedirectUri,
} from "../platform-settings-routes.js";

const ENV_KEYS = [
  "ENGENTY_API_BASE_URL",
  "PUBLIC_APP_URL",
  "ENGENTY_CORE_BASE_URL",
] as const;
const saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function setEnv(apiBaseUrl?: string, publicAppUrl?: string) {
  delete process.env.ENGENTY_API_BASE_URL;
  delete process.env.PUBLIC_APP_URL;
  if (apiBaseUrl !== undefined) {
    process.env.ENGENTY_API_BASE_URL = apiBaseUrl;
  }
  if (publicAppUrl !== undefined) {
    process.env.PUBLIC_APP_URL = publicAppUrl;
  }
}

describe("platform settings setup context", () => {
  it("prefers the API base URL and strips a trailing slash", () => {
    setEnv("https://engenty.example/", "https://other.example");
    expect(publicApiBaseUrl()).toBe("https://engenty.example");
  });

  it("falls back to PUBLIC_APP_URL", () => {
    setEnv(undefined, "https://engenty.example");
    expect(publicApiBaseUrl()).toBe("https://engenty.example");
  });

  it("resolves the manifest placeholder in provider instructions", () => {
    setEnv("https://engenty.example");
    expect(
      expandPlaceholders(
        "Add the authorized redirect URI: <ENGENTY_API_BASE_URL>/api/connections/oauth/callback."
      )
    ).toBe(
      "Add the authorized redirect URI: https://engenty.example/api/connections/oauth/callback."
    );
  });

  it("leaves the placeholder alone when no origin is configured", () => {
    setEnv();
    expect(expandPlaceholders("<ENGENTY_API_BASE_URL>/x")).toBe(
      "<ENGENTY_API_BASE_URL>/x"
    );
  });

  it("derives the OAuth redirect URI from the public origin", () => {
    setEnv("https://engenty.example");
    expect(resolveOAuthRedirectUri(null)).toBe(
      "https://engenty.example/api/connections/oauth/callback"
    );
  });

  it("honours a CONNECTIONS_REDIRECT_URI override", () => {
    setEnv("https://engenty.example");
    expect(resolveOAuthRedirectUri("  https://proxy.example/cb  ")).toBe(
      "https://proxy.example/cb"
    );
  });

  it("reports no redirect URI when the origin is unknown", () => {
    setEnv();
    expect(resolveOAuthRedirectUri(undefined)).toBeNull();
  });

  it("flags *.localhost redirect hosts providers refuse", () => {
    expect(
      isProviderRejectedRedirectHost("https://engenty.localhost/api/x")
    ).toBe(true);
    expect(
      isProviderRejectedRedirectHost("https://inbox.engenty.localhost/api/x")
    ).toBe(true);
  });

  it("accepts loopback and public redirect hosts", () => {
    expect(isProviderRejectedRedirectHost("http://localhost:8787/api/x")).toBe(
      false
    );
    expect(isProviderRejectedRedirectHost("http://127.0.0.1:8787/api/x")).toBe(
      false
    );
    expect(
      isProviderRejectedRedirectHost("https://engenty.engrd.xyz/api/x")
    ).toBe(false);
    expect(isProviderRejectedRedirectHost(null)).toBe(false);
  });

  it("offers core's own origin as the loopback alternative", () => {
    process.env.ENGENTY_CORE_BASE_URL = "http://127.0.0.1:8797";
    expect(loopbackRedirectUri()).toBe(
      "http://127.0.0.1:8797/api/connections/oauth/callback"
    );
  });

  it("has no loopback alternative without a core base URL", () => {
    delete process.env.ENGENTY_CORE_BASE_URL;
    expect(loopbackRedirectUri()).toBeNull();
  });
});
