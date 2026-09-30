import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planPluginPurge } from "./plugin-purge.js";

const roots: string[] = [];

function repo(listed: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-purge-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      engenty: {
        plugins: Object.fromEntries(listed.map((slug) => [slug, "workspace"])),
      },
    })
  );
  return root;
}

function module(
  root: string,
  slug: string,
  manifest: Record<string, unknown>,
  migration: string
): void {
  const dir = path.join(root, "modules", slug);
  fs.mkdirSync(path.join(dir, "supabase", "migrations"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "engenty.plugin.json"),
    JSON.stringify({ id: slug, ...manifest })
  );
  fs.writeFileSync(
    path.join(
      dir,
      "supabase",
      "migrations",
      `20260101000000_plugin_${slug}.sql`
    ),
    migration
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("planPluginPurge", () => {
  it("refuses a module the install still has", () => {
    vi.stubEnv("ENGENTY_MODULE_STAGE", "beta");
    const root = repo(["contacts"]);
    module(root, "contacts", {}, "create schema module_contacts;");
    expect(() => planPluginPurge(root, "contacts")).toThrow(/is installed/);
  });

  it("drops a left-out module's own schema and forgets its migrations", () => {
    vi.stubEnv("ENGENTY_MODULE_STAGE", "beta");
    const root = repo(["banking"]);
    module(
      root,
      "banking",
      {
        stage: "dev",
        supabase: { storageBuckets: [{ name: "banking-statements" }] },
      },
      "create schema if not exists module_banking;\ncreate table module_banking.accounts ();"
    );
    expect(planPluginPurge(root, "banking")).toEqual({
      buckets: ["banking-statements"],
      purgeSql: null,
      schemas: ["module_banking"],
      slug: "banking",
      versions: ["20260101000000"],
    });
  });

  it("runs the module's own purge SQL instead of dropping a schema it shares", () => {
    // Its tables live in Team's schema: dropping module_team would delete
    // Team too.
    vi.stubEnv("ENGENTY_MODULE_STAGE", "beta");
    const root = repo([]);
    module(
      root,
      "team-extras",
      { purge: { sql: "supabase/uninstall.sql" } },
      "create schema if not exists module_team;\ncreate table module_team.absences ();"
    );
    fs.writeFileSync(
      path.join(root, "modules", "team-extras", "supabase", "uninstall.sql"),
      "drop table if exists module_team.absences cascade;"
    );
    const plan = planPluginPurge(root, "team-extras");
    expect(plan.schemas).toEqual([]);
    expect(plan.purgeSql).toContain("module_team.absences");
  });
});
