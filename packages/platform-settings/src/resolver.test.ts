import { describe, expect, it } from "vitest";
import type { PlatformSettingsRepo } from "./dal.js";
import { createSettingsResolver } from "./resolver.js";
import type {
  PlatformSettingEntry,
  SettingSpec,
  SettingValueOut,
} from "./types.js";

function entry(name: string, value: SettingValueOut): PlatformSettingEntry {
  return { name, type: "string", value, updatedAt: "t", updatedBy: null };
}

/** In-memory repo backed by mutable maps; only the read methods are exercised. */
function fakeRepo(store: {
  platform?: Record<string, SettingValueOut>;
  tenant?: Record<string, Record<string, SettingValueOut>>;
}): PlatformSettingsRepo {
  const platform = store.platform ?? {};
  const tenant = store.tenant ?? {};
  return {
    getPlatform: async (n: string) =>
      n in platform ? entry(n, platform[n]) : null,
    listPlatform: async () =>
      Object.entries(platform).map(([n, v]) => entry(n, v)),
    setPlatform: async () => {
      throw new Error("unused");
    },
    deletePlatform: async () => {
      /* unused */
    },
    getTenantOverride: async (t: string, n: string) =>
      tenant[t] && n in tenant[t] ? entry(n, tenant[t][n]) : null,
    listTenantOverrides: async (t: string) =>
      Object.entries(tenant[t] ?? {}).map(([n, v]) => entry(n, v)),
    setTenantOverride: async () => {
      throw new Error("unused");
    },
    deleteTenantOverride: async () => {
      /* unused */
    },
  } as unknown as PlatformSettingsRepo;
}

const specs: SettingSpec[] = [
  {
    key: "AI_GATEWAY_API_KEY",
    configurable: "platform",
    secret: true,
    type: "secret",
  },
  {
    key: "GOOGLE_OAUTH_CLIENT_ID",
    configurable: "tenant",
    secret: false,
    type: "string",
  },
  {
    key: "ENGENTY_REMOTE_CHANNELS_ENABLED",
    configurable: "platform",
    secret: false,
    type: "boolean",
    defaultValue: "false",
  },
];

describe("resolver precedence", () => {
  it("tenant override beats platform and env", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({
        platform: { GOOGLE_OAUTH_CLIENT_ID: "pid" },
        tenant: { t1: { GOOGLE_OAUTH_CLIENT_ID: "tid" } },
      }),
      specs,
      env: { GOOGLE_OAUTH_CLIENT_ID: "eid" },
    });
    const meta = await resolver.resolveSettingMeta("GOOGLE_OAUTH_CLIENT_ID", {
      tenantId: "t1",
    });
    expect(meta).toEqual({ value: "tid", source: "tenant" });
  });

  it("platform beats env", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({ platform: { GOOGLE_OAUTH_CLIENT_ID: "pid" } }),
      specs,
      env: { GOOGLE_OAUTH_CLIENT_ID: "eid" },
    });
    expect(
      await resolver.resolveSettingMeta("GOOGLE_OAUTH_CLIENT_ID", {
        tenantId: "t1",
      })
    ).toEqual({ value: "pid", source: "platform" });
  });

  it("env beats default", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({}),
      specs,
      env: { ENGENTY_REMOTE_CHANNELS_ENABLED: "true" },
    });
    expect(
      await resolver.resolveSettingMeta("ENGENTY_REMOTE_CHANNELS_ENABLED")
    ).toEqual({ value: "true", source: "env" });
  });

  it("falls back to default when nothing is set", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({}),
      specs,
      env: {},
    });
    expect(
      await resolver.resolveSettingMeta("ENGENTY_REMOTE_CHANNELS_ENABLED")
    ).toEqual({ value: "false", source: "default" });
  });

  it("reports unset when there is no value anywhere", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({}),
      specs,
      env: {},
    });
    expect(await resolver.resolveSettingMeta("AI_GATEWAY_API_KEY")).toEqual({
      value: undefined,
      source: "unset",
    });
  });

  it("ignores tenant overrides for platform-only specs", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({
        platform: { AI_GATEWAY_API_KEY: "sk-plat" },
        tenant: { t1: { AI_GATEWAY_API_KEY: "sk-tenant" } },
      }),
      specs,
      env: {},
    });
    expect(
      await resolver.resolveSettingMeta("AI_GATEWAY_API_KEY", {
        tenantId: "t1",
      })
    ).toEqual({ value: "sk-plat", source: "platform" });
  });

  it("treats a whitespace-only env value as unset", async () => {
    const resolver = createSettingsResolver({
      repo: fakeRepo({}),
      specs,
      env: { GOOGLE_OAUTH_CLIENT_ID: "   " },
    });
    expect(await resolver.resolveSettingMeta("GOOGLE_OAUTH_CLIENT_ID")).toEqual(
      { value: undefined, source: "unset" }
    );
  });
});

describe("resolver caching", () => {
  it("caches within the TTL and refreshes after invalidate", async () => {
    const platform: Record<string, SettingValueOut> = {
      GOOGLE_OAUTH_CLIENT_ID: "v1",
    };
    const resolver = createSettingsResolver({
      repo: fakeRepo({ platform }),
      specs,
      env: {},
      ttlMs: 100_000,
    });
    expect(await resolver.resolveSetting("GOOGLE_OAUTH_CLIENT_ID")).toBe("v1");
    platform.GOOGLE_OAUTH_CLIENT_ID = "v2";
    // Still cached.
    expect(await resolver.resolveSetting("GOOGLE_OAUTH_CLIENT_ID")).toBe("v1");
    resolver.invalidate("GOOGLE_OAUTH_CLIENT_ID");
    expect(await resolver.resolveSetting("GOOGLE_OAUTH_CLIENT_ID")).toBe("v2");
  });

  it("expires cache entries after the TTL", async () => {
    let clock = 1000;
    const platform: Record<string, SettingValueOut> = {
      GOOGLE_OAUTH_CLIENT_ID: "v1",
    };
    const resolver = createSettingsResolver({
      repo: fakeRepo({ platform }),
      specs,
      env: {},
      ttlMs: 50,
      now: () => clock,
    });
    expect(await resolver.resolveSetting("GOOGLE_OAUTH_CLIENT_ID")).toBe("v1");
    platform.GOOGLE_OAUTH_CLIENT_ID = "v2";
    clock += 100;
    expect(await resolver.resolveSetting("GOOGLE_OAUTH_CLIENT_ID")).toBe("v2");
  });
});
