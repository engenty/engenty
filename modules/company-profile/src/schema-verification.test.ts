import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies module-owned DB surface is declared in the module, not in committed
 * root supabase/config.toml (module schemas/buckets are composed by supabase:sync).
 */
describe("module_company_profile schema verification", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("module has migration that creates module_company_profile schema", () => {
    const migrationsDir = path.join(
      repoRoot,
      "modules",
      "company-profile",
      "supabase",
      "migrations"
    );
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    const companyProfileMigration = files.find(
      (f) => f.includes("plugin_") && f.includes("company_profile")
    );
    expect(companyProfileMigration).toBeDefined();

    const content = fs.readFileSync(
      path.join(migrationsDir, companyProfileMigration!),
      "utf-8"
    );
    expect(content).toContain("module_company_profile");
    expect(content).toMatch(/create schema.*module_company_profile/i);
    expect(content).toContain("module_company_profile.settings");
  });

  it("declares storage bucket in engenty.plugin.json (composed by supabase:sync)", () => {
    const manifestPath = path.join(
      repoRoot,
      "modules",
      "company-profile",
      "engenty.plugin.json"
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const bucketNames = (manifest.supabase?.storageBuckets ?? []).map(
      (bucket: { name: string }) => bucket.name
    );
    expect(bucketNames).toContain("module-company-profile-logos");
  });
});
