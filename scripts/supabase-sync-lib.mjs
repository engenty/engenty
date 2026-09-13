import fs from "node:fs";
import path from "node:path";

export const STORAGE_BUCKET_MARKER_BEGIN =
  "# >>> engenty:storage-buckets (managed by `engenty generate` — base only in git; run generate locally)";
export const STORAGE_BUCKET_MARKER_END = "# <<< engenty:storage-buckets";

export const API_SCHEMA_MARKER_BEGIN =
  "# >>> engenty:api-schemas (managed by `engenty generate` — base only in git; run generate locally)";
export const API_SCHEMA_MARKER_END = "# <<< engenty:api-schemas";

/** Always exposed — order is stable for diffs and docs. */
export const BASE_API_SCHEMAS = [
  "public",
  "graphql_public",
  "ai",
  "context_graph",
  "core",
];

/** Created by migrations but never PostgREST-exposed. */
export const INTERNAL_POSTGRES_SCHEMAS = new Set([
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "pgbouncer",
  "pgmq",
  "private",
  "public",
  "realtime",
  "storage",
  "supabase_migrations",
  "vault",
]);

const CREATE_SCHEMA_RE =
  /create\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;

export function discoverPostgresSchemasFromMigrations(migrationsDir) {
  const created = new Set();
  if (
    !(fs.existsSync(migrationsDir) && fs.statSync(migrationsDir).isDirectory())
  ) {
    return created;
  }

  for (const fileName of fs.readdirSync(migrationsDir)) {
    if (!fileName.endsWith(".sql")) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf-8");
    for (const match of sql.matchAll(CREATE_SCHEMA_RE)) {
      created.add(match[1].toLowerCase());
    }
  }

  return created;
}

function orderApiSchemas(discovered) {
  const baseSet = new Set(BASE_API_SCHEMAS);
  const moduleSchemas = [...discovered]
    .filter(
      (schema) =>
        !(INTERNAL_POSTGRES_SCHEMAS.has(schema) || baseSet.has(schema))
    )
    .sort((left, right) => left.localeCompare(right));

  return [...BASE_API_SCHEMAS, ...moduleSchemas];
}

export function composeApiSchemas(migrationsDir) {
  return orderApiSchemas(discoverPostgresSchemasFromMigrations(migrationsDir));
}

/**
 * The same list, read from the migration owners' own directories instead of the
 * aggregated (gitignored) output. A fresh clone can answer "which schemas must
 * this install expose?" with no install, no database and no config.toml — which
 * is what the deploy wizard needs, and what the public repo needs so its
 * answer reflects its own module set rather than the one it was filtered from.
 */
export function composeApiSchemasFromOwners(owners) {
  const discovered = new Set();
  for (const owner of owners) {
    for (const schema of discoverPostgresSchemasFromMigrations(
      owner.migrationsPath
    )) {
      discovered.add(schema);
    }
  }
  return orderApiSchemas(discovered);
}

export function parseProjectIdFromConfigToml(content) {
  const match = content.match(/^project_id\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

/**
 * The Supabase CLI names the local Postgres container `supabase_db_<project_id>`,
 * not after the repo folder. Falls back to the folder basename when
 * supabase/config.toml is missing or has no project_id.
 */
export function resolveSupabaseDbContainerName(repoRoot) {
  let projectId = null;
  const configPath = path.join(repoRoot, "supabase", "config.toml");
  if (fs.existsSync(configPath)) {
    projectId = parseProjectIdFromConfigToml(
      fs.readFileSync(configPath, "utf-8")
    );
  }
  return `supabase_db_${projectId ?? path.basename(repoRoot)}`;
}

export function parseApiSchemasFromConfigToml(content) {
  const managed = content.match(
    /# >>> engenty:api-schemas[^\n]*\nschemas\s*=\s*(\[[^\]]*\])/m
  );
  if (managed) {
    return JSON.parse(managed[1]);
  }

  const bare = content.match(/^schemas\s*=\s*(\[[^\]]*\])/m);
  if (bare) {
    return JSON.parse(bare[1]);
  }

  return null;
}

/**
 * Guardrail: committed supabase/config.toml.example must not encode installed modules.
 * Local supabase/config.toml is gitignored and composed by engenty generate.
 */
export function findCommittedSupabaseConfigModuleLeaks(content) {
  const issues = [];

  const schemas = parseApiSchemasFromConfigToml(content);
  if (schemas === null) {
    issues.push("could not parse [api].schemas in supabase/config.toml");
  } else {
    if (JSON.stringify(schemas) !== JSON.stringify(BASE_API_SCHEMAS)) {
      issues.push(
        "committed [api].schemas must list BASE_API_SCHEMAS only (module schemas belong in local sync output)"
      );
    }
    for (const schema of schemas) {
      if (String(schema).startsWith("module_")) {
        issues.push(`committed config lists module schema "${schema}"`);
      }
    }
  }

  const bucketSectionMatch = content.match(
    /# >>> engenty:storage-buckets[^\n]*\n([\s\S]*?)# <<< engenty:storage-buckets/m
  );
  if (!bucketSectionMatch) {
    issues.push(
      "managed storage-bucket markers missing from supabase/config.toml"
    );
  } else if (/^\[storage\.buckets\./m.test(bucketSectionMatch[1].trim())) {
    issues.push(
      "committed storage-buckets block must stay empty (module buckets belong in local sync output)"
    );
  }

  return issues;
}

export function assertCommittedSupabaseConfigIsModuleAgnostic(content) {
  const issues = findCommittedSupabaseConfigModuleLeaks(content);
  if (issues.length > 0) {
    throw new Error(
      `supabase/config.toml is not module-agnostic:\n- ${issues.join("\n- ")}`
    );
  }
}

export function renderApiSchemasLine(schemas) {
  return `schemas = ${JSON.stringify(schemas)}`;
}

export function renderApiSchemasBlock(schemas) {
  return `${API_SCHEMA_MARKER_BEGIN}\n${renderApiSchemasLine(schemas)}\n${API_SCHEMA_MARKER_END}`;
}

/**
 * A begin marker is matched by its `# >>> engenty:<block>` prefix only: the
 * parenthetical after it is documentation, and it has changed wording over
 * time while every gitignored config.toml on disk keeps whatever was written
 * when it was generated. Returns the marker line's [start, end) or null.
 */
function findBeginMarkerLine(original, beginMarker) {
  const prefix = beginMarker.split(" (")[0];
  const start = original.indexOf(prefix);
  if (start === -1) {
    return null;
  }
  const lineEnd = original.indexOf("\n", start);
  return { end: lineEnd === -1 ? original.length : lineEnd, start };
}

export function syncManagedBlock(params) {
  const { beginMarker, content, endMarker, original } = params;
  const begin = findBeginMarkerLine(original, beginMarker);
  const endIdx = original.indexOf(endMarker);

  if (begin && endIdx !== -1 && endIdx > begin.start) {
    const before = original.slice(0, begin.start);
    const after = original.slice(endIdx + endMarker.length);
    return `${before}${content}${after}`;
  }

  return null;
}

export function syncApiSchemasInConfigToml(original, schemas) {
  const block = renderApiSchemasBlock(schemas);
  const managed = syncManagedBlock({
    beginMarker: API_SCHEMA_MARKER_BEGIN,
    content: block,
    endMarker: API_SCHEMA_MARKER_END,
    original,
  });
  if (managed !== null) {
    return managed;
  }

  const bareLine = renderApiSchemasLine(schemas);
  if (/^schemas\s*=\s*\[[^\]]*\]\s*$/m.test(original)) {
    return original.replace(/^schemas\s*=\s*\[[^\]]*\]\s*$/m, block);
  }

  throw new Error(
    `Could not locate api.schemas in supabase/config.toml. Expected either managed markers:\n${API_SCHEMA_MARKER_BEGIN}\n${API_SCHEMA_MARKER_END}\nor a bare schemas = [...] line under [api].`
  );
}

export function syncStorageBucketsInConfigToml(original, bucketBlocks) {
  const begin = findBeginMarkerLine(original, STORAGE_BUCKET_MARKER_BEGIN);
  const endIdx = original.indexOf(STORAGE_BUCKET_MARKER_END);
  if (!begin || endIdx === -1 || endIdx < begin.start) {
    throw new Error(
      `Managed storage-bucket markers not found in supabase/config.toml. Expected:\n${STORAGE_BUCKET_MARKER_BEGIN}\n${STORAGE_BUCKET_MARKER_END}`
    );
  }

  const before = `${original.slice(0, begin.start)}${STORAGE_BUCKET_MARKER_BEGIN}`;
  const after = original.slice(endIdx);
  const middle =
    bucketBlocks.length > 0 ? `\n${bucketBlocks.join("\n\n")}\n` : "\n";
  return `${before}${middle}${after}`;
}
