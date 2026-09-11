/**
 * "Which space owns this record?"
 *
 * Used by the legacy `/mdl/*` redirect (PLAN-spaces.md Phase 5a) and by the
 * module-operation Space policy: get/update/delete of a space-owned row must
 * resolve the record's Space and refuse a cross-Space id even when the caller
 * can enter both Spaces.
 *
 * A `null` answer means "unknown" for the redirect (fall back to the default
 * Space). Operation policy treats the same null as fail-closed: do not
 * dispatch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type IdKind = "text" | "uuid";

interface SpaceColumnSource {
  idKind: IdKind;
  kind: "space_column";
  schema: string;
  table: string;
}

interface ParentSource {
  idKind: IdKind;
  kind: "parent";
  parent: RecordSource;
  parentIdColumn: string;
  schema: string;
  table: string;
}

interface FileOwnerSource {
  idKind: "uuid";
  kind: "file_owner";
  schema: "module_files";
  table: "file_entries" | "file_folders";
}

type RecordSource = SpaceColumnSource | ParentSource | FileOwnerSource;

const PROJECTS_TABLE: SpaceColumnSource = {
  idKind: "text",
  kind: "space_column",
  schema: "module_projects",
  table: "projects",
};

const KNOWLEDGE_BASES_TABLE: SpaceColumnSource = {
  idKind: "text",
  kind: "space_column",
  schema: "module_kb",
  table: "knowledge_bases",
};

function kbChild(table: string): ParentSource {
  return {
    idKind: "text",
    kind: "parent",
    parent: KNOWLEDGE_BASES_TABLE,
    parentIdColumn: "kb_id",
    schema: "module_kb",
    table,
  };
}

const PHASE_TASKS_TABLE: ParentSource = {
  idKind: "text",
  kind: "parent",
  parent: PROJECTS_TABLE,
  parentIdColumn: "project_id",
  schema: "module_projects",
  table: "phase_tasks",
};

const KB_ARTICLES_TABLE: ParentSource = kbChild("articles");

/**
 * Where a module's records carry their space, keyed by the module id that
 * appears in `/mdl/<moduleId>/<recordId>` and in `spacePolicy.record.moduleId`.
 *
 * Child tables join to a parent that already has `space_id`. Files use
 * `(owner_type, owner_id)`: a space owner *is* the space; a project owner
 * inherits the project's space.
 */
const RECORD_SOURCES: Record<string, RecordSource[]> = {
  files: [
    {
      idKind: "uuid",
      kind: "file_owner",
      schema: "module_files",
      table: "file_entries",
    },
    {
      idKind: "uuid",
      kind: "file_owner",
      schema: "module_files",
      table: "file_folders",
    },
  ],
  "knowledge-base": [
    KNOWLEDGE_BASES_TABLE,
    KB_ARTICLES_TABLE,
    kbChild("faqs"),
    kbChild("categories"),
    kbChild("tags"),
    kbChild("kb_sources"),
    kbChild("inbox_items"),
    {
      idKind: "text",
      kind: "parent",
      parent: KB_ARTICLES_TABLE,
      parentIdColumn: "article_id",
      schema: "module_kb",
      table: "attachments",
    },
  ],
  projects: [
    PROJECTS_TABLE,
    {
      idKind: "text",
      kind: "parent",
      parent: PROJECTS_TABLE,
      parentIdColumn: "project_id",
      schema: "module_projects",
      table: "project_phases",
    },
    PHASE_TASKS_TABLE,
    {
      idKind: "text",
      kind: "parent",
      parent: PHASE_TASKS_TABLE,
      parentIdColumn: "task_id",
      schema: "module_projects",
      table: "task_comments",
    },
    {
      idKind: "text",
      kind: "parent",
      parent: PHASE_TASKS_TABLE,
      parentIdColumn: "task_id",
      schema: "module_projects",
      table: "task_file_links",
    },
  ],
  tasks: [tasksSpaceColumn("tasks"), tasksSpaceColumn("triggers")],
};

function tasksSpaceColumn(table: string): SpaceColumnSource {
  return {
    idKind: "uuid",
    kind: "space_column",
    schema: "module_tasks",
    table,
  };
}

/** Modules whose records can be located at all. Used to skip a pointless round trip. */
export function hasSpaceRecordSource(moduleId: string): boolean {
  return moduleId in RECORD_SOURCES;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUsableRecordId(recordId: string, idKind: IdKind): boolean {
  const id = recordId.trim();
  if (!id || id.length > 128) {
    return false;
  }
  return idKind === "uuid" ? UUID_PATTERN.test(id) : true;
}

function asSpaceId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function lookupRow(
  client: SupabaseClient,
  source: { schema: string; table: string },
  columns: string,
  recordId: string,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await client
    .schema(source.schema)
    .from(source.table)
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("id", recordId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function resolveSource(
  client: SupabaseClient,
  source: RecordSource,
  recordId: string,
  tenantId: string
): Promise<string | null> {
  if (!isUsableRecordId(recordId, source.idKind)) {
    return null;
  }
  if (source.kind === "space_column") {
    const row = await lookupRow(client, source, "space_id", recordId, tenantId);
    return asSpaceId(row?.space_id);
  }
  if (source.kind === "parent") {
    const row = await lookupRow(
      client,
      source,
      source.parentIdColumn,
      recordId,
      tenantId
    );
    const parentId = asSpaceId(row?.[source.parentIdColumn]);
    if (!parentId) {
      return null;
    }
    return resolveSource(client, source.parent, parentId, tenantId);
  }
  const row = await lookupRow(
    client,
    source,
    "owner_type, owner_id",
    recordId,
    tenantId
  );
  const ownerType = typeof row?.owner_type === "string" ? row.owner_type : "";
  const ownerId = asSpaceId(row?.owner_id);
  if (!(ownerType && ownerId)) {
    return null;
  }
  if (ownerType === "space") {
    return ownerId;
  }
  if (ownerType === "project") {
    return resolveSource(client, PROJECTS_TABLE, ownerId, tenantId);
  }
  return null;
}

/**
 * The space a record belongs to, or null when it cannot be determined —
 * unknown module, unusable id, record not found, or a row whose space is
 * still null.
 */
export async function findSpaceIdForRecord(
  client: SupabaseClient,
  input: { moduleId: string; recordId: string; tenantId: string }
): Promise<string | null> {
  const sources = RECORD_SOURCES[input.moduleId];
  if (!sources) {
    return null;
  }
  for (const source of sources) {
    const spaceId = await resolveSource(
      client,
      source,
      input.recordId,
      input.tenantId
    );
    if (spaceId) {
      return spaceId;
    }
  }
  return null;
}
