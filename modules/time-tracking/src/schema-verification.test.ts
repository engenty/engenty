import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies that the module_time_tracking schema is properly configured.
 * Prevents PostgREST PGRST106 when the schema is migrated but not exposed.
 */
describe("module_time_tracking schema verification", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("module has migration that creates module_time_tracking schema", () => {
    const migrationsDir = path.join(
      repoRoot,
      "modules",
      "time-tracking",
      "supabase",
      "migrations"
    );
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    const migration = files.find(
      (f) => f.includes("plugin_") && f.includes("time_tracking")
    );
    expect(migration).toBeDefined();

    const content = fs.readFileSync(
      path.join(migrationsDir, migration!),
      "utf-8"
    );
    expect(content).toContain("module_time_tracking");
    expect(content).toMatch(/create schema.*module_time_tracking/i);
    expect(content).toContain("module_time_tracking.time_entries");
  });

  it("supabase config.toml exposes module_time_tracking in API schemas", () => {
    const configPath = path.join(repoRoot, "supabase", "config.toml");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("module_time_tracking");
    const schemasMatch = content.match(/schemas\s*=\s*\[([\s\S]*?)\]/);
    expect(schemasMatch).toBeDefined();
    expect(schemasMatch![1]).toContain("module_time_tracking");
  });
});
