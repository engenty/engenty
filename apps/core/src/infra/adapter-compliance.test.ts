/**
 * Adapter compliance tests: verify infra factories and Supabase adapters
 * implement expected contracts. See docs/dev/backend-abstraction.md.
 */
import { describe, expect, it } from "vitest";
import { createAnonAuthAdapter, createDatabaseAdapter } from "./index.js";

describe("createDatabaseAdapter compliance", () => {
  it("returns null when config has no Supabase URL or key", () => {
    const result = createDatabaseAdapter({
      supabaseUrl: "",
      supabaseServiceRoleKey: "",
    });
    expect(result).toBeNull();
  });

  it("returns null when config has URL but no service role key", () => {
    const result = createDatabaseAdapter({
      supabaseUrl: "https://test.supabase.co",
      supabaseServiceRoleKey: "",
    });
    expect(result).toBeNull();
  });

  it("returns Supabase client when config has URL and key", () => {
    const config = {
      supabaseUrl: "https://test.supabase.co",
      supabaseServiceRoleKey: "test-service-role-key",
    };
    const result = createDatabaseAdapter(config);
    expect(result).not.toBeNull();
    expect(typeof result?.from).toBe("function");
  });
});

describe("createAnonAuthAdapter compliance", () => {
  it("returns null when config has no Supabase URL or anon key", () => {
    const result = createAnonAuthAdapter({
      supabaseUrl: "",
      supabaseAnonKey: "",
    });
    expect(result).toBeNull();
  });

  it("returns null when config has URL but no anon key", () => {
    const result = createAnonAuthAdapter({
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "",
    });
    expect(result).toBeNull();
  });

  it("returns Supabase client when config has URL and anon key", () => {
    const result = createAnonAuthAdapter({
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });
    expect(result).not.toBeNull();
    expect(typeof result?.from).toBe("function");
  });
});
