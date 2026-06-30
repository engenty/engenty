import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertCommittedSupabaseConfigIsModuleAgnostic,
  BASE_API_SCHEMAS,
  composeApiSchemas,
  discoverPostgresSchemasFromMigrations,
  renderApiSchemasBlock,
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
});
