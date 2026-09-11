/**
 * Space Pages over `ai.artifact` (markdown + folder rows).
 *
 * Pages are space-native: they do not go through a module operation, because
 * they are not a Work-tab app. The store is the same table agents already
 * write with `artifact_write` type `markdown`. Folders are container rows
 * (`type: folder`) with no body of their own.
 *
 * Identity is the artifact id. `parent_id` is containment. Status `archived`
 * is the delete — same as every other artifact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const AI_SCHEMA = "ai";
const PAGE_TYPES = ["markdown", "folder"] as const;
const INLINE_MAX_BYTES = 262_144;

export type PageArtifactType = (typeof PAGE_TYPES)[number];

export interface PageArtifactRow {
  created_at: string;
  current_version: number;
  id: string;
  parent_id: string | null;
  scope_id: string;
  status: string;
  title: string;
  type: PageArtifactType;
  updated_at: string;
}

export class PagesVersionConflictError extends Error {
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super(`Page version conflict; current version is ${currentVersion}`);
    this.name = "PagesVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class PagesContentTooLargeError extends Error {
  constructor() {
    super(`Page content exceeds the inline limit of ${INLINE_MAX_BYTES} bytes`);
    this.name = "PagesContentTooLargeError";
  }
}

function assertInlineSize(content: string): void {
  if (Buffer.byteLength(content, "utf8") > INLINE_MAX_BYTES) {
    throw new PagesContentTooLargeError();
  }
}

function isPageType(type: string): type is PageArtifactType {
  return type === "markdown" || type === "folder";
}

const COLUMNS =
  "id, title, type, parent_id, scope_id, status, current_version, created_at, updated_at";

export interface CreatePageInput {
  content: string;
  parentId: string | null;
  spaceId: string;
  tenantId: string;
  title: string;
  type: PageArtifactType;
}

export interface PagesStore {
  addVersion(input: {
    artifactId: string;
    content: string;
    expectedVersion: number;
    spaceId: string;
    tenantId: string;
  }): Promise<PageArtifactRow>;
  archive(input: {
    artifactId: string;
    spaceId: string;
    tenantId: string;
  }): Promise<void>;
  create(input: CreatePageInput): Promise<PageArtifactRow>;
  get(input: {
    artifactId: string;
    spaceId: string;
    tenantId: string;
  }): Promise<PageArtifactRow | null>;
  getContent(input: {
    artifactId: string;
    spaceId: string;
    tenantId: string;
  }): Promise<{ content: string; row: PageArtifactRow } | null>;
  list(input: {
    parentId: string | null;
    spaceId: string;
    tenantId: string;
  }): Promise<PageArtifactRow[]>;
  update(input: {
    artifactId: string;
    parentId?: string | null;
    spaceId: string;
    tenantId: string;
    title?: string;
  }): Promise<PageArtifactRow | null>;
}

export function createPagesStore(
  getDb: (tenantId: string) => SupabaseClient
): PagesStore {
  function db(tenantId: string) {
    return getDb(tenantId).schema(AI_SCHEMA);
  }

  async function getRow(input: {
    artifactId: string;
    spaceId: string;
    tenantId: string;
  }): Promise<PageArtifactRow | null> {
    const { data, error } = await db(input.tenantId)
      .from("artifact")
      .select(COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.artifactId)
      .eq("scope_type", "space")
      .eq("scope_id", input.spaceId)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      throw new Error(`pages select: ${error.message}`);
    }
    const row = data as PageArtifactRow | null;
    if (!(row && isPageType(row.type))) {
      return null;
    }
    return row;
  }

  return {
    async list(input) {
      let query = db(input.tenantId)
        .from("artifact")
        .select(COLUMNS)
        .eq("tenant_id", input.tenantId)
        .eq("scope_type", "space")
        .eq("scope_id", input.spaceId)
        .eq("status", "active")
        .in("type", [...PAGE_TYPES]);
      query =
        input.parentId === null
          ? query.is("parent_id", null)
          : query.eq("parent_id", input.parentId);
      const { data, error } = await query
        .order("title", { ascending: true })
        .limit(500);
      if (error) {
        throw new Error(`pages list: ${error.message}`);
      }
      return ((data as PageArtifactRow[] | null) ?? []).filter((row) =>
        isPageType(row.type)
      );
    },

    async get(input) {
      return await getRow(input);
    },

    async getContent(input) {
      const row = await getRow(input);
      if (!row) {
        return null;
      }
      const { data, error } = await db(input.tenantId)
        .from("artifact_version")
        .select("content")
        .eq("tenant_id", input.tenantId)
        .eq("artifact_id", row.id)
        .eq("version", row.current_version)
        .maybeSingle();
      if (error) {
        throw new Error(`pages version select: ${error.message}`);
      }
      return {
        content: ((data as { content?: string | null } | null)?.content ??
          "") as string,
        row,
      };
    },

    async create(input) {
      assertInlineSize(input.content);
      const { data: artifact, error: aError } = await db(input.tenantId)
        .from("artifact")
        .insert({
          tenant_id: input.tenantId,
          type: input.type,
          title: input.title,
          scope_type: "space",
          scope_id: input.spaceId,
          parent_id: input.parentId,
          created_by_kind: "user",
          current_version: 1,
          storage: "inline",
          status: "active",
        })
        .select(COLUMNS)
        .single();
      if (aError) {
        throw new Error(`pages insert: ${aError.message}`);
      }
      const row = artifact as PageArtifactRow;
      const { error: vError } = await db(input.tenantId)
        .from("artifact_version")
        .insert({
          artifact_id: row.id,
          tenant_id: input.tenantId,
          version: 1,
          content: input.content,
          created_by_kind: "user",
        });
      if (vError) {
        await db(input.tenantId)
          .from("artifact")
          .delete()
          .eq("tenant_id", input.tenantId)
          .eq("id", row.id);
        throw new Error(`pages version insert: ${vError.message}`);
      }
      return row;
    },

    async addVersion(input) {
      assertInlineSize(input.content);
      const row = await getRow(input);
      if (!row) {
        return Promise.reject(new Error("page not found"));
      }
      if (row.type !== "markdown") {
        return Promise.reject(new Error("folders have no body to version"));
      }
      if (row.current_version !== input.expectedVersion) {
        throw new PagesVersionConflictError(row.current_version);
      }
      const nextVersion = input.expectedVersion + 1;
      const { error: vError } = await db(input.tenantId)
        .from("artifact_version")
        .insert({
          artifact_id: row.id,
          tenant_id: input.tenantId,
          version: nextVersion,
          content: input.content,
          created_by_kind: "user",
        });
      if (vError) {
        if (vError.code === "23505") {
          const current = await getRow(input);
          throw new PagesVersionConflictError(
            current?.current_version ?? nextVersion
          );
        }
        throw new Error(`pages version insert: ${vError.message}`);
      }
      const { data: updated, error: uError } = await db(input.tenantId)
        .from("artifact")
        .update({
          current_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", row.id)
        .lt("current_version", nextVersion)
        .select(COLUMNS)
        .maybeSingle();
      if (uError) {
        throw new Error(`pages update: ${uError.message}`);
      }
      return ((updated as PageArtifactRow | null) ??
        (await getRow(input))) as PageArtifactRow;
    },

    async update(input) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.parentId !== undefined) {
        patch.parent_id = input.parentId;
      }
      if (input.title !== undefined) {
        patch.title = input.title;
      }
      const { data, error } = await db(input.tenantId)
        .from("artifact")
        .update(patch)
        .eq("tenant_id", input.tenantId)
        .eq("id", input.artifactId)
        .eq("scope_type", "space")
        .eq("scope_id", input.spaceId)
        .eq("status", "active")
        .select(COLUMNS)
        .maybeSingle();
      if (error) {
        throw new Error(`pages move: ${error.message}`);
      }
      const row = data as PageArtifactRow | null;
      if (!(row && isPageType(row.type))) {
        return null;
      }
      return row;
    },

    async archive(input) {
      const { error } = await db(input.tenantId)
        .from("artifact")
        .update({
          status: "archived",
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.artifactId)
        .eq("scope_type", "space")
        .eq("scope_id", input.spaceId);
      if (error) {
        throw new Error(`pages archive: ${error.message}`);
      }
    },
  };
}
