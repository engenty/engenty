import { afterEach, describe, expect, it, vi } from "vitest";
import { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "./dev-service-urls.fixture.js";
import {
  isEngentyCorsOriginAllowed,
  resolveEngentyDevServiceUrls,
} from "./dev-service-urls.js";

describe("resolveEngentyDevServiceUrls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when required dev service URLs are missing", () => {
    expect(() => resolveEngentyDevServiceUrls()).toThrow(
      /ENGENTY_(UI|API|AI|DOCS)_BASE_URL|ENGENTY_CORS_ORIGINS/
    );
  });

  it("returns trimmed URLs from env", () => {
    vi.stubEnv(
      "ENGENTY_UI_BASE_URL",
      `${ENGENTY_DEV_SERVICE_URLS_FIXTURE.ui}/`
    );
    vi.stubEnv("ENGENTY_API_BASE_URL", ENGENTY_DEV_SERVICE_URLS_FIXTURE.api);
    vi.stubEnv("ENGENTY_AI_BASE_URL", ENGENTY_DEV_SERVICE_URLS_FIXTURE.ai);
    vi.stubEnv("ENGENTY_DOCS_BASE_URL", ENGENTY_DEV_SERVICE_URLS_FIXTURE.docs);
    vi.stubEnv(
      "ENGENTY_CORS_ORIGINS",
      ENGENTY_DEV_SERVICE_URLS_FIXTURE.corsOrigins
    );

    const urls = resolveEngentyDevServiceUrls();
    expect(urls.ui).toBe(ENGENTY_DEV_SERVICE_URLS_FIXTURE.ui);
    expect(urls.corsOrigins).toContain("https://engenty.localhost");
    expect(urls.corsOrigins).toContain("https://ai.engenty.localhost");
    expect(isEngentyCorsOriginAllowed("https://engenty.localhost")).toBe(true);
    expect(isEngentyCorsOriginAllowed("https://evil.example")).toBe(false);
  });

  it("falls back to PUBLIC_APP_URL's origin when no list is set", () => {
    // A single-origin deployment's allow-list is its own public URL, so making
    // the operator restate it only creates a way to get it wrong.
    vi.stubEnv("ENGENTY_CORS_ORIGINS", "");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example.com");

    expect(isEngentyCorsOriginAllowed("https://app.example.com")).toBe(true);
    expect(isEngentyCorsOriginAllowed("https://evil.example")).toBe(false);
  });

  it("prefers an explicit list over PUBLIC_APP_URL", () => {
    vi.stubEnv("ENGENTY_CORS_ORIGINS", "https://studio.example.com");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example.com");

    expect(isEngentyCorsOriginAllowed("https://studio.example.com")).toBe(true);
    expect(isEngentyCorsOriginAllowed("https://app.example.com")).toBe(false);
  });
});
