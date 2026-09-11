import { afterEach, describe, expect, it, vi } from "vitest";
import { MASTRA_STUDIO_API_ENV } from "./mastra-studio-api.js";
import {
  MASTRA_STUDIO_TENANT_ENV,
  readStudioTenantIdFromEnv,
} from "./mastra-studio-tenant.js";

const TENANT = "00000000-0000-4000-8000-000000000001";

describe("readStudioTenantIdFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when Studio is off", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "");
    vi.stubEnv(MASTRA_STUDIO_TENANT_ENV, TENANT);
    expect(readStudioTenantIdFromEnv()).toBeUndefined();
  });

  it("returns undefined in production even when both flags are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    vi.stubEnv(MASTRA_STUDIO_TENANT_ENV, TENANT);
    expect(readStudioTenantIdFromEnv()).toBeUndefined();
  });

  it("returns the UUID when Studio is on", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    vi.stubEnv(MASTRA_STUDIO_TENANT_ENV, TENANT);
    expect(readStudioTenantIdFromEnv()).toBe(TENANT);
  });

  it("ignores an invalid UUID", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    vi.stubEnv(MASTRA_STUDIO_TENANT_ENV, "not-a-uuid");
    expect(readStudioTenantIdFromEnv()).toBeUndefined();
  });
});
