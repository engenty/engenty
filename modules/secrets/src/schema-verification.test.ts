import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies that the module_secrets schema is properly configured.
 * Prevents "Invalid schema: module_secrets" errors caused by:
 * - Missing migration (run pnpm migrations:aggregate / engenty db sync before db reset)
 * - config.toml not exposing the schema (PostgREST won't see it)
 *
 * Note: a live `authenticator.pgrst.db_schemas` role setting can still shadow
 * config.toml after install — restart Supabase (or ALTER ROLE + NOTIFY pgrst)
 * when creates fail with PGRST106 despite this test passing.
 */
describe("module_secrets schema verification", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("module has migration that creates module_secrets schema", () => {
    const migrationsDir = path.join(
      repoRoot,
      "modules",
      "secrets",
      "supabase",
      "migrations"
    );
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    const secretsMigration = files.find(
      (f) => f.includes("plugin_") && f.includes("secrets")
    );
    expect(secretsMigration).toBeDefined();

    const content = fs.readFileSync(
      path.join(migrationsDir, secretsMigration!),
      "utf-8"
    );
    expect(content).toContain("module_secrets");
    expect(content).toMatch(/create schema.*module_secrets/i);
    expect(content).toContain("module_secrets.secrets");
  });

  it("supabase config.toml exposes module_secrets in API schemas", () => {
    const configPath = path.join(repoRoot, "supabase", "config.toml");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("module_secrets");
    const schemasMatch = content.match(/schemas\s*=\s*\[([\s\S]*?)\]/);
    expect(schemasMatch).toBeDefined();
    expect(schemasMatch![1]).toContain("module_secrets");
  });
});
