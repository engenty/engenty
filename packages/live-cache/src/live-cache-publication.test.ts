import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const MODULE_REALTIME_MIGRATION_SPECS: Array<{
  module: string;
  fileIncludes: string;
  tables: string[];
}> = [
  // Closed modules (e.g. tasks) are validated in engenty-pro when present.
];

const MODULE_REALTIME_MIGRATIONS = MODULE_REALTIME_MIGRATION_SPECS.filter(
  (spec) => fs.existsSync(path.join(repoRoot, "modules", spec.module))
);

describe("live cache publication guardrails", () => {
  const migrationsDir = path.join(repoRoot, "supabase/migrations");
  const initialSchema = fs.readFileSync(
    path.join(migrationsDir, "00000000000001_initial_schema.sql"),
    "utf-8"
  );

  it("core schema defines ai.thread for realtime list invalidation", () => {
    // Table was `ai.agent_session`; the dump names it `ai.thread`. Publication
    // membership is not in the pg_dump baseline (Postgres omits it), so the
    // guardrail is the table the UI actually subscribes to.
    expect(initialSchema).toMatch(/create table ai\.thread\b/i);
  });

  it("a migration after the baseline re-publishes the tables the UI subscribes to", () => {
    // pg_dump dropped every `alter publication … add table` when the
    // migrations were consolidated, so a database built from the baseline had
    // an EMPTY publication and no live list ever refreshed. The restore
    // migration is the guardrail; these are the core tables it must carry.
    const restore = fs
      .readdirSync(migrationsDir)
      .find((name) => name.includes("_realtime_publication_restore.sql"));
    expect(restore).toBeDefined();
    const content = fs.readFileSync(
      path.join(migrationsDir, restore!),
      "utf-8"
    );
    for (const table of [
      "ai.artifact",
      "ai.thread",
      "core.notifications",
      "core.tenant_settings",
      "core.user_settings",
    ]) {
      expect(content).toContain(`'${table}'`);
    }
    expect(content).toMatch(/alter publication supabase_realtime add table/i);
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

  it("custom access token hook exists with grants", () => {
    expect(initialSchema).toContain("core.custom_access_token_hook");
    // pg_dump writes GRANT ALL; older dedicated migrations used GRANT EXECUTE.
    expect(initialSchema).toMatch(
      /grant (?:all|execute) on function core\.custom_access_token_hook/i
    );
  });
});
