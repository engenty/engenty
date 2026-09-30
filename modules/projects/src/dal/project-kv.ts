/**
 * Per-project key/value store on the shared scoped KV repo
 * (`@engenty/scoped-kv-settings`, as `module_kb.kb_settings`): one row per
 * (project, name), the project carried in `context`.
 */
import {
  createScopedKvSettingsRepoSupabase,
  type TenantSettingValue,
} from "@engenty/scoped-kv-settings";
import type { Project } from "../schema/types.js";

export type ProjectKvRepo = ReturnType<typeof createProjectKvRepo>;

export function createProjectKvRepo(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const kv = createScopedKvSettingsRepoSupabase({
    adapter,
    schema: "module_projects",
    scopeId,
    table: "project_kv",
    tenantId,
  });
  const context = (projectId: string) => ({ project_id: projectId });
  const entry = (row: { name: string; type: string; value: unknown }) => ({
    name: row.name,
    type: row.type,
    value: row.value,
  });

  return {
    async list(projectId: string) {
      const rows = await kv.list({ context: context(projectId) });
      return rows.map(entry);
    },
    async get(projectId: string, name: string) {
      const row = await kv.get(context(projectId), name);
      return row ? entry(row) : null;
    },
    async set(projectId: string, input: TenantSettingValue) {
      return entry(await kv.set(context(projectId), input));
    },
    delete(projectId: string, name: string) {
      return kv.delete(context(projectId), name);
    },
  };
}

/**
 * Project fields that live in the KV store, not in `projects` columns. They
 * stay fields on `Project` in the API; the DAL reads them through the
 * `project_kv` embed and writes them as KV rows.
 */
export interface ProjectKvFields {
  cover: Project["cover"];
  enabled_tabs: string[] | null;
  subtitle: string | null;
  timeplan_enabled: boolean;
}

export const PROJECT_KV_FIELD_NAMES = [
  "cover",
  "enabled_tabs",
  "subtitle",
  "timeplan_enabled",
] as const satisfies readonly (keyof ProjectKvFields)[];

/** PostgREST embed for project selects (FK `project_kv.project_id`). */
export const PROJECT_KV_EMBED =
  "project_kv(name,type,value_string,value_jsonb,value_numeric,value_boolean)";

interface ProjectKvEmbedRow {
  name: string;
  value_boolean: boolean | null;
  value_jsonb: unknown;
  value_string: string | null;
}

/** The KV-backed fields from an embedded `project_kv` array; absent = default. */
export function projectKvFieldsFromEmbed(embed: unknown): ProjectKvFields {
  const rows = Array.isArray(embed) ? (embed as ProjectKvEmbedRow[]) : [];
  const byName = new Map(rows.map((r) => [r.name, r]));
  const tabs = byName.get("enabled_tabs")?.value_jsonb;
  return {
    cover: (byName.get("cover")?.value_jsonb as Project["cover"]) ?? null,
    enabled_tabs: Array.isArray(tabs)
      ? tabs.filter((t): t is string => typeof t === "string")
      : null,
    subtitle: byName.get("subtitle")?.value_string ?? null,
    timeplan_enabled: byName.get("timeplan_enabled")?.value_boolean === true,
  };
}

/**
 * Write the KV-backed fields present in `fields`: a value upserts its row,
 * `null` (or `false` for timeplan, the default) deletes it.
 */
export async function writeProjectKvFields(
  kv: ProjectKvRepo,
  projectId: string,
  fields: Partial<ProjectKvFields>
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  const setOrDelete = (
    name: keyof ProjectKvFields,
    value: TenantSettingValue | null
  ) => {
    writes.push(value ? kv.set(projectId, value) : kv.delete(projectId, name));
  };
  if (fields.cover !== undefined) {
    setOrDelete(
      "cover",
      fields.cover
        ? { name: "cover", type: "json", value_jsonb: fields.cover }
        : null
    );
  }
  if (fields.enabled_tabs !== undefined) {
    setOrDelete(
      "enabled_tabs",
      fields.enabled_tabs
        ? {
            name: "enabled_tabs",
            type: "json",
            value_jsonb: fields.enabled_tabs,
          }
        : null
    );
  }
  if (fields.subtitle !== undefined) {
    const text = fields.subtitle?.trim();
    setOrDelete(
      "subtitle",
      text ? { name: "subtitle", type: "string", value_string: text } : null
    );
  }
  if (fields.timeplan_enabled !== undefined) {
    setOrDelete(
      "timeplan_enabled",
      fields.timeplan_enabled
        ? { name: "timeplan_enabled", type: "boolean", value_boolean: true }
        : null
    );
  }
  await Promise.all(writes);
}
