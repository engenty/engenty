/**
 * Space markdown/folder rows over `ai.artifact` (parent_id, folders).
 *
 * Not registered as a Data-tab root — markdown pages mix into Artifacts with
 * other artifact types. This adapter remains for tests and for `/data` CRUD
 * if a caller addresses `Pages/` directly.
 */

import {
  dataConflictError,
  notFoundError,
  notSupportedError,
  PluginOperationError,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataCreateInput,
  type SpaceDataDeleteInput,
  type SpaceDataDocument,
  type SpaceDataEntry,
  type SpaceDataFolder,
  type SpaceDataListing,
  type SpaceDataMoveInput,
  type SpaceDataNodeType,
  spaceDataNodeName,
  spaceDataNodeRecordId,
  spaceDataPathSegments,
} from "@engenty/plugin-sdk";
import {
  type PageArtifactRow,
  PagesContentTooLargeError,
  type PagesStore,
  PagesVersionConflictError,
} from "./pages-store.js";

export const PAGES_ROOT = "Pages";
export const PAGES_MODULE_ID = "pages";
export const PAGES_ROOT_NODE_TYPE = "pages.root";
export const PAGES_PAGE_NODE_TYPE = "pages.page";
export const PAGES_FOLDER_NODE_TYPE = "pages.folder";
export const PAGE_EXTENSION = ".md";

const PAGE_NODE_TYPE: SpaceDataNodeType = {
  extension: PAGE_EXTENSION,
  id: PAGES_PAGE_NODE_TYPE,
  kind: "record",
  label: "Page",
};

function pageName(row: { id: string; title: string }): string {
  return spaceDataNodeName({
    extension: PAGE_EXTENSION,
    recordId: row.id,
    title: row.title,
  });
}

function folderName(row: { id: string; title: string }): string {
  return spaceDataNodeName({
    extension: "",
    recordId: row.id,
    title: row.title,
  });
}

function join(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function entryOf(row: PageArtifactRow, parentPath: string): SpaceDataEntry {
  const name = pageName(row);
  return {
    kind: "record",
    name,
    nodeType: PAGES_PAGE_NODE_TYPE,
    path: join(parentPath, name),
    recordId: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    version: String(row.current_version),
  };
}

function folderOf(row: PageArtifactRow, parentPath: string): SpaceDataFolder {
  const name = folderName(row);
  return {
    name,
    nodeType: PAGES_FOLDER_NODE_TYPE,
    path: join(parentPath, name),
  };
}

function pageDocument(
  row: PageArtifactRow,
  parentPath: string,
  content: string
): SpaceDataDocument {
  const name = pageName(row);
  return {
    kind: "record",
    members: [
      {
        content,
        contentType: "text/markdown",
        derived: false,
        editable: true,
        encoding: "utf8",
        name,
      },
    ],
    name,
    nodeType: PAGES_PAGE_NODE_TYPE,
    path: join(parentPath, name),
    recordId: row.id,
    updatedAt: row.updated_at,
    version: String(row.current_version),
  };
}

function folderDocument(
  row: PageArtifactRow,
  parentPath: string
): SpaceDataDocument {
  const name = folderName(row);
  return {
    kind: "bundle",
    members: [],
    name,
    nodeType: PAGES_FOLDER_NODE_TYPE,
    path: join(parentPath, name),
    recordId: row.id,
    updatedAt: row.updated_at,
    version: String(row.current_version),
  };
}

function scope(ctx: SpaceDataContext) {
  return { spaceId: ctx.spaceId, tenantId: ctx.tenantId };
}

async function resolveFolder(
  store: PagesStore,
  ctx: SpaceDataContext,
  segments: string[]
): Promise<{ id: string | null }> {
  let id: string | null = null;
  for (const segment of segments) {
    const recordId = spaceDataNodeRecordId(segment, "");
    if (!recordId) {
      throw notFoundError("page_not_found", `No folder "${segment}" here.`);
    }
    const listing = await store.list({ ...scope(ctx), parentId: id });
    const folder = listing.find(
      (row) => row.id === recordId && row.type === "folder"
    );
    if (!folder) {
      throw notFoundError("page_not_found", `No folder "${segment}" here.`);
    }
    id = folder.id;
  }
  return { id };
}

function lastSegment(path: string): string {
  const segments = spaceDataPathSegments(path);
  const name = segments.at(-1);
  if (!name) {
    throw notFoundError(
      "page_not_found",
      "The Pages root itself cannot be opened as a file."
    );
  }
  return name;
}

async function resolvePage(
  store: PagesStore,
  ctx: SpaceDataContext,
  path: string
): Promise<{ parentPath: string; row: PageArtifactRow }> {
  const segments = spaceDataPathSegments(path);
  const name = lastSegment(path);
  const recordId = spaceDataNodeRecordId(name, PAGE_EXTENSION);
  if (!recordId) {
    throw notFoundError(
      "page_not_found",
      `"${name}" does not name a page — a page's name carries its id and ends in ${PAGE_EXTENSION}.`
    );
  }
  const parentPath = segments.slice(0, -1).join("/");
  await resolveFolder(store, ctx, segments.slice(0, -1));
  const row = await store.get({ ...scope(ctx), artifactId: recordId });
  if (!(row && row.type === "markdown")) {
    throw notFoundError("page_not_found", `No page "${name}" here.`);
  }
  return { parentPath, row };
}

async function resolveAny(
  store: PagesStore,
  ctx: SpaceDataContext,
  path: string
): Promise<{ parentPath: string; row: PageArtifactRow }> {
  const segments = spaceDataPathSegments(path);
  const name = lastSegment(path);
  const pageId = spaceDataNodeRecordId(name, PAGE_EXTENSION);
  if (pageId) {
    return await resolvePage(store, ctx, path);
  }
  const { id } = await resolveFolder(store, ctx, segments);
  if (!id) {
    throw notFoundError(
      "page_not_found",
      "The Pages root itself cannot be moved or deleted."
    );
  }
  const row = await store.get({ ...scope(ctx), artifactId: id });
  if (!row) {
    throw notFoundError("page_not_found", `No folder "${name}" here.`);
  }
  return { parentPath: segments.slice(0, -1).join("/"), row };
}

async function ancestorIds(
  store: PagesStore,
  ctx: SpaceDataContext,
  startId: string | null
): Promise<Set<string>> {
  const seen = new Set<string>();
  let cursor = startId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = await store.get({ ...scope(ctx), artifactId: cursor });
    cursor = row?.parent_id ?? null;
  }
  return seen;
}

async function collectDescendants(
  store: PagesStore,
  ctx: SpaceDataContext,
  folderId: string
): Promise<string[]> {
  const ids: string[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) {
      break;
    }
    const children = await store.list({ ...scope(ctx), parentId });
    for (const child of children) {
      ids.push(child.id);
      if (child.type === "folder") {
        queue.push(child.id);
      }
    }
  }
  return ids;
}

function mapWriteError(error: unknown): never {
  if (error instanceof PagesVersionConflictError) {
    throw dataConflictError(
      "This page changed since you opened it — read it again and retry.",
      { current_version: error.currentVersion }
    );
  }
  if (error instanceof PagesContentTooLargeError) {
    throw new PluginOperationError("content_too_large", error.message, {
      status: 413,
    });
  }
  throw error;
}

export function createPagesSpaceDataAdapter(params: {
  store: PagesStore;
}): SpaceDataAdapter {
  const { store } = params;
  return {
    alwaysVisible: true,
    label: PAGES_ROOT,
    moduleId: PAGES_MODULE_ID,
    nodeTypes: [PAGE_NODE_TYPE],
    recordScopes: ["all", "space"],
    root: PAGES_ROOT,
    rootNodeType: PAGES_ROOT_NODE_TYPE,

    async list(ctx, path): Promise<SpaceDataListing> {
      const segments = spaceDataPathSegments(path);
      const { id } = await resolveFolder(store, ctx, segments);
      const rows = await store.list({ ...scope(ctx), parentId: id });
      return {
        entries: rows
          .filter((row) => row.type === "markdown")
          .map((row) => entryOf(row, path)),
        folders: rows
          .filter((row) => row.type === "folder")
          .map((row) => folderOf(row, path)),
        ...(segments.length > 0
          ? {
              self: {
                name: segments.at(-1) ?? PAGES_ROOT,
                nodeType: PAGES_FOLDER_NODE_TYPE,
                path,
              },
            }
          : {}),
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      const { parentPath, row } = await resolvePage(store, ctx, path);
      const loaded = await store.getContent({
        ...scope(ctx),
        artifactId: row.id,
      });
      return pageDocument(row, parentPath, loaded?.content ?? "");
    },

    async write(ctx, input): Promise<SpaceDataDocument> {
      const { parentPath, row } = await resolvePage(store, ctx, input.path);
      const expectedVersion = Number.parseInt(input.baseVersion, 10);
      if (!Number.isFinite(expectedVersion) || expectedVersion < 1) {
        throw dataConflictError(
          "This page changed since you opened it — read it again and retry."
        );
      }
      try {
        const updated = await store.addVersion({
          ...scope(ctx),
          artifactId: row.id,
          content: input.content,
          expectedVersion,
        });
        return pageDocument(updated, parentPath, input.content);
      } catch (error) {
        mapWriteError(error);
      }
    },

    async createNode(
      ctx: SpaceDataContext,
      input: SpaceDataCreateInput
    ): Promise<SpaceDataDocument> {
      const { id: parentId } = await resolveFolder(
        store,
        ctx,
        spaceDataPathSegments(input.parentPath)
      );
      if (input.kind === "folder") {
        const row = await store.create({
          ...scope(ctx),
          content: "",
          parentId,
          title: input.name,
          type: "folder",
        });
        return folderDocument(row, input.parentPath);
      }
      const row = await store.create({
        ...scope(ctx),
        content: input.content ?? "",
        parentId,
        title: input.name,
        type: "markdown",
      });
      return pageDocument(row, input.parentPath, input.content ?? "");
    },

    async deleteNode(
      ctx: SpaceDataContext,
      input: SpaceDataDeleteInput
    ): Promise<{ deleted: true }> {
      const { row } = await resolveAny(store, ctx, input.path);
      if (row.type === "folder") {
        const descendants = await collectDescendants(store, ctx, row.id);
        if (descendants.length > 0 && !input.recursive) {
          throw notSupportedError(
            "This folder is not empty — pass recursive to take its pages too."
          );
        }
        for (const id of [...descendants].reverse()) {
          await store.archive({ ...scope(ctx), artifactId: id });
        }
      }
      await store.archive({ ...scope(ctx), artifactId: row.id });
      return { deleted: true };
    },

    async moveNode(
      ctx: SpaceDataContext,
      input: SpaceDataMoveInput
    ): Promise<SpaceDataDocument> {
      const { parentPath: currentParent, row } = await resolveAny(
        store,
        ctx,
        input.path
      );
      let nextParentId: string | null | undefined;
      let nextParentPath = currentParent;
      if (input.toParentPath !== undefined) {
        const destination = await resolveFolder(
          store,
          ctx,
          spaceDataPathSegments(input.toParentPath)
        );
        nextParentId = destination.id;
        nextParentPath = input.toParentPath;
        if (row.type === "folder" && nextParentId) {
          const ancestors = await ancestorIds(store, ctx, nextParentId);
          if (ancestors.has(row.id) || nextParentId === row.id) {
            throw notSupportedError(
              "A folder cannot be moved into itself or one of its descendants."
            );
          }
        }
      }
      const updated = await store.update({
        ...scope(ctx),
        artifactId: row.id,
        ...(nextParentId === undefined ? {} : { parentId: nextParentId }),
        ...(input.newName ? { title: input.newName } : {}),
      });
      if (!updated) {
        throw notFoundError("page_not_found", "The page could not be moved.");
      }
      if (updated.type === "folder") {
        return folderDocument(updated, nextParentPath);
      }
      const loaded = await store.getContent({
        ...scope(ctx),
        artifactId: updated.id,
      });
      return pageDocument(updated, nextParentPath, loaded?.content ?? "");
    },
  };
}
