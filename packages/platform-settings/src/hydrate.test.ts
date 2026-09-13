import { describe, expect, it } from "vitest";
import {
  applyPlatformSettingToEnv,
  hydratePlatformSettingsIntoEnv,
} from "./hydrate.js";

function fakeSupabase(rows: Record<string, unknown>) {
  // Mirrors `getOne`: select("*").eq("scope").eq("name").is("tenant_id", null).maybeSingle()
  const build = (scope: string, name: string) => ({
    is: () => ({
      maybeSingle: async () => ({
        data:
          scope === "platform" && name in rows
            ? {
                dek_id: null,
                name,
                scope,
                tenant_id: null,
                type: "string",
                updated_at: "2026-09-13T00:00:00Z",
                updated_by: null,
                value_boolean: null,
                value_enc: null,
                value_jsonb: null,
                value_numeric: null,
                value_string: rows[name],
              }
            : null,
        error: null,
      }),
    }),
  });
  const from = () => ({
    select: () => ({
      eq: (_scopeCol: string, scope: string) => ({
        eq: (_nameCol: string, name: string) => build(scope, name),
      }),
    }),
  });
  return { schema: () => ({ from }) };
}

describe("applyPlatformSettingToEnv", () => {
  it("sets a value and restores the boot value when cleared", () => {
    const env: Record<string, string | undefined> = { A: "from-file" };
    expect(applyPlatformSettingToEnv({ env, key: "A", value: "db" })).toBe(
      true
    );
    expect(env.A).toBe("db");
    expect(applyPlatformSettingToEnv({ env, key: "A", value: "db" })).toBe(
      false
    );
    expect(applyPlatformSettingToEnv({ env, key: "A", value: null })).toBe(
      true
    );
    expect(env.A).toBe("from-file");
  });

  it("removes a key the environment never had", () => {
    const env: Record<string, string | undefined> = {};
    applyPlatformSettingToEnv({ env, key: "B", value: "x" });
    expect(env.B).toBe("x");
    applyPlatformSettingToEnv({ env, key: "B", value: "" });
    expect("B" in env).toBe(false);
  });
});

describe("hydratePlatformSettingsIntoEnv", () => {
  it("hydrates stored rows and, on reload, clears keys whose row is gone", async () => {
    const env: Record<string, string | undefined> = {};
    const first = await hydratePlatformSettingsIntoEnv({
      env,
      keys: ["K1", "K2"],
      supabase: fakeSupabase({ K1: "one", K2: "two" }),
    });
    expect(first).toEqual({ cleared: [], hydrated: ["K1", "K2"] });
    expect(env).toEqual({ K1: "one", K2: "two" });

    const reload = await hydratePlatformSettingsIntoEnv({
      clearMissing: true,
      env,
      keys: ["K1", "K2"],
      supabase: fakeSupabase({ K1: "one" }),
    });
    expect(reload).toEqual({ cleared: ["K2"], hydrated: ["K1"] });
    expect(env).toEqual({ K1: "one" });
  });

  it("leaves missing keys alone at boot", async () => {
    const env: Record<string, string | undefined> = { K2: "file" };
    await hydratePlatformSettingsIntoEnv({
      env,
      keys: ["K2"],
      supabase: fakeSupabase({}),
    });
    expect(env.K2).toBe("file");
  });
});
