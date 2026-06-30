import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies that the module_tasks schema is properly configured.
 * Prevents "Invalid schema: module_tasks" errors caused by:
 * - Missing migration (run pnpm migrations:aggregate before db reset)
 * - config.toml not exposing the schema (PostgREST won't see it)
 */
describe("module_tasks schema verification", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("module has migration that creates module_tasks schema", () => {
    const migrationsDir = path.join(
      repoRoot,
      "modules",
      "tasks",
      "supabase",
      "migrations"
    );
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    const tasksMigration = files.find(
      (f) => f.includes("plugin_") && f.includes("tasks")
    );
    expect(tasksMigration).toBeDefined();

    const content = fs.readFileSync(
      path.join(migrationsDir, tasksMigration!),
      "utf-8"
    );
    expect(content).toContain("module_tasks");
    expect(content).toMatch(/create schema.*module_tasks/i);
    expect(content).toContain("module_tasks.tasks");
  });

  it("supabase config.toml exposes module_tasks in API schemas", () => {
    const configPath = path.join(repoRoot, "supabase", "config.toml");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("module_tasks");
    const schemasMatch = content.match(/schemas\s*=\s*\[([\s\S]*?)\]/);
    expect(schemasMatch).toBeDefined();
    expect(schemasMatch![1]).toContain("module_tasks");
  });
});
