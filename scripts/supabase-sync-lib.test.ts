import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveMigrationOwners } from "./lib/migration-owners.mjs";
import {
  assertCommittedSupabaseConfigIsModuleAgnostic,
  BASE_API_SCHEMAS,
  composeApiSchemas,
  composeApiSchemasFromOwners,
  discoverPostgresSchemasFromMigrations,
  parseProjectIdFromConfigToml,
  renderApiSchemasBlock,
  resolveSupabaseDbContainerName,
  STORAGE_BUCKET_MARKER_BEGIN,
  STORAGE_BUCKET_MARKER_END,
  syncApiSchemasInConfigToml,
} from "./supabase-sync-lib.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function moduleAgnosticConfigTemplate() {
  return `[api]
${renderApiSchemasBlock(BASE_API_SCHEMAS)}

${STORAGE_BUCKET_MARKER_BEGIN}
${STORAGE_BUCKET_MARKER_END}
`;
}

describe("supabase-sync-lib", () => {
  it("guardrail rejects module-specific managed config blocks", () => {
    const base = moduleAgnosticConfigTemplate();
    expect(() =>
      assertCommittedSupabaseConfigIsModuleAgnostic(base)
    ).not.toThrow();

    const leaked = syncApiSchemasInConfigToml(base, [
      ...BASE_API_SCHEMAS,
      "module_company_profile",
    ]);
    expect(() => assertCommittedSupabaseConfigIsModuleAgnostic(leaked)).toThrow(
      /module-agnostic/
    );
  });

  it("supabase/config.toml.example stays module-agnostic", () => {
    const content = fs.readFileSync(
      path.join(repoRoot, "supabase/config.toml.example"),
      "utf8"
    );
    expect(() =>
      assertCommittedSupabaseConfigIsModuleAgnostic(content)
    ).not.toThrow();
  });

  it("discovers module schemas from aggregated migrations", () => {
    const migrationsDir = path.join(repoRoot, "supabase/migrations");

    const discovered = discoverPostgresSchemasFromMigrations(migrationsDir);
    expect(discovered.has("module_company_profile")).toBe(true);
    expect(discovered.has("private")).toBe(true);
  });

  it("composes base schemas plus module schemas, excluding internal ones", () => {
    const migrationsDir = path.join(repoRoot, "supabase/migrations");

    const schemas = composeApiSchemas(migrationsDir);
    expect(schemas.slice(0, BASE_API_SCHEMAS.length)).toEqual(BASE_API_SCHEMAS);
    expect(schemas).toContain("module_company_profile");
    expect(schemas).not.toContain("private");
  });

  it("composes the same schemas from committed sources as from the aggregate", () => {
    // The deploy wizard reads the source side, because a fresh clone has
    // neither the aggregated migrations nor a config.toml. If the two ever
    // disagree, a hosted install gets an exposed-schema list that does not
    // match the migrations it is about to run.
    const owners = resolveMigrationOwners(repoRoot);
    const fromSources = composeApiSchemasFromOwners(owners);

    expect(fromSources.slice(0, BASE_API_SCHEMAS.length)).toEqual(
      BASE_API_SCHEMAS
    );
    expect(fromSources).toContain("module_company_profile");
    expect(fromSources).not.toContain("private");
    expect(fromSources).toEqual(
      composeApiSchemas(path.join(repoRoot, "supabase/migrations"))
    );
  });

  it("replaces a bare schemas line with managed markers", () => {
    const original = `[api]
enabled = true
schemas = ["public","graphql_public","core"]
extra_search_path = ["public"]
`;

    const next = syncApiSchemasInConfigToml(original, [
      "public",
      "graphql_public",
      "core",
      "module_company_profile",
    ]);

    expect(next).toContain(
      renderApiSchemasBlock([
        "public",
        "graphql_public",
        "core",
        "module_company_profile",
      ])
    );
  });

  it("updates an existing managed schemas block", () => {
    const original = `[api]
${renderApiSchemasBlock(BASE_API_SCHEMAS)}
`;

    const next = syncApiSchemasInConfigToml(original, [
      ...BASE_API_SCHEMAS,
      "module_company_profile",
    ]);

    expect(next).toContain('"module_company_profile"');
    expect(next.match(/# >>> engenty:api-schemas/g)?.length).toBe(1);
  });

  it("parses project_id, ignoring commented-out lines", () => {
    const content = `project_id = "engenty-local"

[functions.my-function]
# project_id = "my-firebase-project"
`;
    expect(parseProjectIdFromConfigToml(content)).toBe("engenty-local");
    expect(
      parseProjectIdFromConfigToml('# project_id = "my-firebase-project"\n')
    ).toBeNull();
  });

  it("derives the db container name from supabase/config.toml project_id", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-container-"));
    try {
      fs.mkdirSync(path.join(dir, "supabase"));
      fs.writeFileSync(
        path.join(dir, "supabase", "config.toml"),
        'project_id = "engenty-local"\n',
        "utf-8"
      );
      expect(resolveSupabaseDbContainerName(dir)).toBe(
        "supabase_db_engenty-local"
      );
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("falls back to the folder basename when config.toml is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-no-config-"));
    try {
      expect(resolveSupabaseDbContainerName(dir)).toBe(
        `supabase_db_${path.basename(dir)}`
      );
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("repo config.toml resolves to the real container name", () => {
    // Derive the expectation from the same config the resolver reads: the
    // gitignored supabase/config.toml when present (worktrees with a dedicated
    // stack use a unique project_id — see the release skill's mode d), else
    // the committed example's project_id.
    const localConfig = path.join(repoRoot, "supabase", "config.toml");
    const exampleConfig = path.join(
      repoRoot,
      "supabase",
      "config.toml.example"
    );
    const source = fs.existsSync(localConfig) ? localConfig : exampleConfig;
    const projectId = fs
      .readFileSync(source, "utf-8")
      .match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
    expect(projectId).toBeTruthy();
    expect(resolveSupabaseDbContainerName(repoRoot)).toBe(
      `supabase_db_${projectId}`
    );
  });
});
