import fs from "node:fs";
import path from "node:path";
import {
  readEngentyPluginsManifest,
  readPluginManifest,
  resolveModuleDir,
} from "@engenty/environment";
import { isModuleStageInstalled, isPluginStage } from "@engenty/plugin-sdk";
import { installModuleStage } from "../plugins/module-stage.js";

/**
 * What purging a module removes. Read from the module's own files, so its
 * code must still be on disk: purge first, then delete the folder (the
 * WordPress order — `uninstall.php` runs before the files go).
 */
export interface PluginPurgePlan {
  /** Storage buckets it declares — emptied and deleted through the Storage API. */
  buckets: string[];
  /**
   * The module's own uninstall SQL (`purge.sql` in its manifest), for a module
   * whose tables live in another module's schema. Replaces the schema drop.
   */
  purgeSql: string | null;
  /** Schemas its migrations create — dropped with everything in them. */
  schemas: string[];
  slug: string;
  /** Its migration versions — removed from the history, so reinstalling reruns them. */
  versions: string[];
}

const SCHEMA_NAME = /^module_[a-z0-9_]+$/;
const CREATE_SCHEMA =
  /create\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi;
const VERSION = /^(\d{14})_.+\.sql$/;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlList(values: readonly string[]): string {
  return values.map(sqlString).join(", ");
}

/**
 * Reads the plan off the module's files. Refuses a module this install still
 * has: listed in `engenty.plugins` and installed at ENGENTY_MODULE_STAGE.
 * Deactivate it first — uninstall it, or give it a lower stage.
 */
export function planPluginPurge(
  repoRoot: string,
  slug: string
): PluginPurgePlan {
  const dir = resolveModuleDir(repoRoot, slug);
  const manifest = readPluginManifest(dir);
  if (!manifest) {
    throw new Error(
      `No module "${slug}" on disk (${path.relative(repoRoot, dir)}). Purge reads what to remove from the module's own files; run it before deleting the folder.`
    );
  }
  const stage = isPluginStage(manifest.stage) ? manifest.stage : undefined;
  const listed = readEngentyPluginsManifest(repoRoot).slugs.includes(slug);
  const installStage = installModuleStage();
  if (listed && isModuleStageInstalled(stage, installStage)) {
    throw new Error(
      `"${slug}" is installed (stage ${stage ?? "stable"} at ENGENTY_MODULE_STAGE=${installStage}). Uninstall it first: pnpm engenty plugins uninstall ${slug}`
    );
  }

  const migrationsDir = path.join(dir, "supabase", "migrations");
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((name) => VERSION.test(name))
    : [];
  const schemas = new Set<string>();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    for (const match of sql.matchAll(CREATE_SCHEMA)) {
      const name = match[1].toLowerCase();
      if (SCHEMA_NAME.test(name)) {
        schemas.add(name);
      }
    }
  }

  const purge = manifest.purge as { sql?: unknown } | undefined;
  const purgeSql =
    typeof purge?.sql === "string"
      ? fs.readFileSync(path.join(dir, purge.sql), "utf8")
      : null;
  const supabase = manifest.supabase as
    | { storageBuckets?: Array<{ name?: unknown }> }
    | undefined;

  return {
    buckets: (supabase?.storageBuckets ?? [])
      .map((bucket) => bucket.name)
      .filter((name): name is string => typeof name === "string"),
    purgeSql,
    schemas: purgeSql ? [] : [...schemas].sort(),
    slug,
    versions: files.map((file) => file.slice(0, 14)).sort(),
  };
}

/**
 * Objects OUTSIDE the schemas that depend on something inside them: foreign
 * keys, views, policies. Dropping the schema would silently take those with
 * it — offers' foreign keys into module_contacts, for one. The manifests
 * understate these links (offers lists contacts as optional), so the
 * database is asked.
 */
export function purgeDependentsSql(schemas: readonly string[]): string {
  const inside = `(${sqlList(schemas)})`;
  return `
select distinct dn.nspname || '.' || dc.relname as object, 'foreign key' as kind
  from pg_constraint con
  join pg_class rc on rc.oid = con.confrelid
  join pg_namespace rn on rn.oid = rc.relnamespace
  join pg_class dc on dc.oid = con.conrelid
  join pg_namespace dn on dn.oid = dc.relnamespace
 where con.contype = 'f' and rn.nspname in ${inside} and dn.nspname not in ${inside}
union
select distinct vn.nspname || '.' || v.relname, 'view'
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class v on v.oid = r.ev_class
  join pg_namespace vn on vn.oid = v.relnamespace
  join pg_class t on t.oid = d.refobjid
  join pg_namespace tn on tn.oid = t.relnamespace
 where d.classid = 'pg_rewrite'::regclass and tn.nspname in ${inside} and vn.nspname not in ${inside}
union
select distinct pn.nspname || '.' || pc.relname || ' (policy ' || p.polname || ')', 'policy'
  from pg_policy p
  join pg_depend d on d.objid = p.oid and d.classid = 'pg_policy'::regclass
  join pg_class t on t.oid = d.refobjid
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_class pc on pc.oid = p.polrelid
  join pg_namespace pn on pn.oid = pc.relnamespace
 where tn.nspname in ${inside} and pn.nspname not in ${inside}`;
}

/**
 * One statement, so it is all or nothing: `supabase db query` runs a single
 * command, and a DO block is one. It takes the module's tables, the core
 * rows that point at it, and its migration history. Kept on purpose: audit
 * events and approval requests (history), routines and workflows (what people
 * wrote), API token scopes.
 */
export function purgeSql(plan: PluginPurgePlan): string {
  const slug = sqlString(plan.slug);
  const lines: string[] = [];
  if (plan.purgeSql) {
    lines.push(plan.purgeSql.trim());
  }
  for (const schema of plan.schemas) {
    lines.push(`drop schema if exists ${schema} cascade;`);
  }
  lines.push(
    `delete from core.space_mount where resource_type = 'module' and resource_key = ${slug};`,
    `delete from core.tenant_plugin_overrides where plugin_id = ${slug};`,
    `delete from ai.engenty_instruction_overrides where module_id = ${slug};`,
    `delete from core.approval_grants where module_id = ${slug};`
  );
  if (plan.versions.length > 0) {
    lines.push(
      `delete from supabase_migrations.schema_migrations where version in (${sqlList(plan.versions)});`
    );
  }
  lines.push("perform pg_notify('pgrst', 'reload schema');");
  return `do $purge$\nbegin\n${lines.join("\n")}\nend\n$purge$;\n`;
}
