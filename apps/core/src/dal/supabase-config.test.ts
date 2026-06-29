import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "./supabase-config.js";

describe("resolveSupabaseConfig", () => {
  it("returns url, serviceRoleKey, and anonKey when provided", () => {
    const prevAnon = process.env.SUPABASE_ANON_KEY;
    const prevPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
    try {
      Reflect.deleteProperty(process.env, "SUPABASE_ANON_KEY");
      Reflect.deleteProperty(process.env, "SUPABASE_PUBLISHABLE_KEY");
      const resolved = resolveSupabaseConfig({
        supabaseUrl: "https://example.supabase.co",
        supabaseServiceRoleKey: "service-role",
        supabasePublishableKey: "pk-test",
      });
      expect(resolved.url).toBe("https://example.supabase.co");
      expect(resolved.serviceRoleKey).toBe("service-role");
      expect(resolved.anonKey).toBe("pk-test");
    } finally {
      if (prevAnon === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_ANON_KEY");
      } else {
        process.env.SUPABASE_ANON_KEY = prevAnon;
      }
      if (prevPublishable === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_PUBLISHABLE_KEY");
      } else {
        process.env.SUPABASE_PUBLISHABLE_KEY = prevPublishable;
      }
    }
  });

  it("throws when required values are missing", () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      process.env.SUPABASE_URL = "";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "";
      expect(() => resolveSupabaseConfig({})).toThrow(
        "Missing Supabase service configuration."
      );
    } finally {
      if (prevUrl === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_URL");
      } else {
        process.env.SUPABASE_URL = prevUrl;
      }
      if (prevKey === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_SERVICE_ROLE_KEY");
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      }
    }
  });
});
