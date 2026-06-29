import { describe, expect, it } from "vitest";
import { createAiDatabaseAdapter } from "../database.js";

describe("createAiDatabaseAdapter", () => {
  it("returns null when config has no Supabase URL or key", () => {
    const result = createAiDatabaseAdapter({
      supabaseServiceRoleKey: "",
      supabaseUrl: "",
    });

    expect(result).toBeNull();
  });

  it("returns null when config has URL but no service role key", () => {
    const result = createAiDatabaseAdapter({
      supabaseServiceRoleKey: "",
      supabaseUrl: "https://test.supabase.co",
    });

    expect(result).toBeNull();
  });

  it("returns Supabase client when config has URL and key", () => {
    const result = createAiDatabaseAdapter({
      supabaseServiceRoleKey: "test-service-role-key",
      supabaseUrl: "https://test.supabase.co",
    });

    expect(result).not.toBeNull();
    expect(typeof result?.from).toBe("function");
  });
});
