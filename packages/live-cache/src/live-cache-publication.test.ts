import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const MODULE_REALTIME_MIGRATIONS: Array<{
  module: string;
  fileIncludes: string;
  tables: string[];
}> = [
  // Closed modules (e.g. tasks) are validated in engenty-pro when present.
].filter((spec) =>
  fs.existsSync(path.join(repoRoot, "modules", spec.module))
);

describe("live cache publication guardrails", () => {
  it("core realtime migration publishes ai.agent_session", () => {
    const migrationsDir = path.join(repoRoot, "supabase/migrations");
    const file = fs
      .readdirSync(migrationsDir)
      .find(
        (name) =>
          name.includes("core_realtime_publication") ||
          name.includes("initial_schema")
      );
    expect(file).toBeDefined();
    const content = fs.readFileSync(path.join(migrationsDir, file!), "utf-8");
    expect(content).toMatch(
      /alter publication supabase_realtime add table ai\.agent_session/i
    );
  });

  for (const spec of MODULE_REALTIME_MIGRATIONS) {
    it(`${spec.module} realtime migration grants select and publishes tables`, () => {
      const moduleMigrationsDir = path.join(
        repoRoot,
        "modules",
        spec.module,
        "supabase",
        "migrations"
      );
      const mainMigrationsDir = path.join(repoRoot, "supabase/migrations");

      let file: string | undefined;
      let migrationsDir = moduleMigrationsDir;

      if (fs.existsSync(moduleMigrationsDir)) {
        file = fs
          .readdirSync(moduleMigrationsDir)
          .find((name) => name.includes(spec.fileIncludes));
      }

      if (!file) {
        // Fallback to checking the aggregated plugin migration in the main migrations directory
        migrationsDir = mainMigrationsDir;
        file = fs
          .readdirSync(mainMigrationsDir)
          .find((name) => name.includes(`_plugin_${spec.module}.sql`));
      }

      expect(file).toBeDefined();
      const content = fs.readFileSync(path.join(migrationsDir, file!), "utf-8");
      expect(content).toMatch(
        /grant usage on schema module_tasks to authenticated/i
      );
      expect(content).toMatch(/grant select on table module_tasks\./i);
      for (const table of spec.tables) {
        expect(content).toMatch(
          new RegExp(
            `alter publication supabase_realtime add table ${table.replace(".", "\\.")}`,
            "i"
          )
        );
      }
    });
  }

  it("custom access token hook migration exists with grants", () => {
    const migrationsDir = path.join(repoRoot, "supabase/migrations");
    const hookFile = fs
      .readdirSync(migrationsDir)
      .find(
        (name) =>
          name.includes("custom_access_token_hook.sql") ||
          name.includes("initial_schema")
      );
    expect(hookFile).toBeDefined();
    const content = fs.readFileSync(
      path.join(migrationsDir, hookFile!),
      "utf-8"
    );
    expect(content).toContain("core.custom_access_token_hook");
    expect(content).toMatch(
      /grant execute on function core\.custom_access_token_hook/i
    );
  });
});
