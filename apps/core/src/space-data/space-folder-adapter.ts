/**
 * The Space's own folder in the Data tab — the bytes a computer sees at
 * `/space` (the Space's commons, `tenants/<t>/spaces/<s>/ai/workspace/commons/`).
 *
 * Two roots over it, one per top-level folder people work in:
 *
 * | Root        | Folder       | On a computer         |
 * |-------------|--------------|-----------------------|
 * | `Agents`    | `agent/`     | `/space/agent/`       |
 * | `Public`    | `public/`    | `/space/public/`      |
 *
 * A path here IS the storage key below the folder, so a file an agent writes
 * to `/space/public/x.csv` is `Public/x.csv` in the tab and back.
 *
 * People only: an agent already has `/space` on its computer and in its file
 * tools, and the same file under `/data/Documents` too would be one file at
 * two paths.
 *
 * No database: the storage prefix is the store. Space access is checked by the
 * data routes before any adapter runs; the keys never leave this Space's
 * prefix.
 */

import {
  type FileStorageFile,
  type FileStorageService,
  guessFileStorageMimeFromFilename,
  SPACE_AGENT_FOLDER,
  SPACE_AGENTS_DATA_ROOT,
  SPACE_PUBLIC_FOLDER,
  workWorkspacePrefix,
} from "@engenty/file-storage";
import {
  dataConflictError,
  notFoundError,
  PluginOperationError,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataDocument,
  type SpaceDataEncoding,
  type SpaceDataEntry,
  type SpaceDataListing,
  type SpaceDataNodeType,
  searchSpaceDataByWalk,
} from "@engenty/plugin-sdk";

export const SPACE_FILE_NODE_TYPE = "space.file";

/** Written to make an empty folder exist; never listed. */
const FOLDER_PLACEHOLDER = ".keep";

const FILE_NODE_TYPE: SpaceDataNodeType = {
  extension: "",
  id: SPACE_FILE_NODE_TYPE,
  kind: "record",
  label: "File",
};

/**
 * One `moduleId` per root: the tree keys a root by it, and these are three
 * roots of one store, not one module.
 */
export const SPACE_FOLDER_ROOTS = [
  {
    folder: SPACE_AGENT_FOLDER,
    label: SPACE_AGENTS_DATA_ROOT,
    moduleId: "space-agents",
    root: SPACE_AGENTS_DATA_ROOT,
  },
  {
    folder: SPACE_PUBLIC_FOLDER,
    label: "Public",
    moduleId: "space-public",
    root: "Public",
  },
] as const;

/** Sidecars the file routes hide too: derived, never a file of their own. */
const HIDDEN_SUFFIXES = [
  ".extracted.json",
  ".extracted.md",
  ".preview.pdf",
  ".thumb.webp",
];

function isHidden(name: string): boolean {
  return (
    name === FOLDER_PLACEHOLDER ||
    name === ".emptyFolderPlaceholder" ||
    HIDDEN_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** `a/b.csv` → `["a","b.csv"]`; refuses `..`, empty and absolute segments. */
function segments(path: string): string[] {
  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new PluginOperationError("invalid_path", `Invalid path: ${path}`, {
      status: 400,
    });
  }
  return parts;
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed.includes("/") ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    throw new PluginOperationError("invalid_name", `Invalid name: ${name}`, {
      status: 400,
    });
  }
  return trimmed;
}

function join(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("/");
}

function toEntry(path: string, file: FileStorageFile): SpaceDataEntry {
  const version = file.updated_at || file.created_at;
  return {
    kind: "record",
    mimeType: file.mime_type || guessFileStorageMimeFromFilename(file.filename),
    name: file.filename,
    nodeType: SPACE_FILE_NODE_TYPE,
    path,
    recordId: file.key,
    sizeBytes: file.size_bytes,
    updatedAt: version,
    version,
  };
}

export function createSpaceFolderAdapter(input: {
  folder: string;
  getStorage: () => FileStorageService | null;
  label: string;
  moduleId: string;
  root: string;
}): SpaceDataAdapter {
  function storage(): FileStorageService {
    const service = input.getStorage();
    if (!service) {
      throw new PluginOperationError(
        "storage_unavailable",
        "File storage is not configured",
        { status: 503 }
      );
    }
    return service;
  }

  /** Full key of a path below this root, no trailing `/`. */
  function keyOf(ctx: SpaceDataContext, path: string): string {
    return join(
      `${workWorkspacePrefix(ctx.tenantId, ctx.spaceId, "space")}${input.folder}`,
      ...segments(path)
    );
  }

  async function fileAt(
    ctx: SpaceDataContext,
    path: string
  ): Promise<FileStorageFile | null> {
    if (segments(path).length === 0) {
      return null;
    }
    return await storage().getFile(keyOf(ctx, path));
  }

  async function readDocument(
    ctx: SpaceDataContext,
    path: string
  ): Promise<SpaceDataDocument> {
    const key = keyOf(ctx, path);
    const [file, bytes] = await Promise.all([
      storage().getFile(key),
      storage().download(key),
    ]);
    if (!(file && bytes)) {
      throw notFoundError("not_found", `No file at ${input.root}/${path}`);
    }
    const mime =
      file.mime_type || guessFileStorageMimeFromFilename(file.filename);
    const encoding: SpaceDataEncoding = isTextMime(mime) ? "utf8" : "base64";
    const version = file.updated_at || file.created_at;
    return {
      kind: "record",
      members: [
        {
          content:
            encoding === "utf8"
              ? new TextDecoder().decode(bytes)
              : Buffer.from(bytes).toString("base64"),
          contentType: mime,
          derived: false,
          editable: encoding === "utf8",
          encoding,
          name: file.filename,
        },
      ],
      name: file.filename,
      nodeType: SPACE_FILE_NODE_TYPE,
      path,
      recordId: key,
      updatedAt: version,
      version,
    };
  }

  function bytesOf(content: string, encoding?: SpaceDataEncoding): Uint8Array {
    return encoding === "base64"
      ? new Uint8Array(Buffer.from(content, "base64"))
      : new TextEncoder().encode(content);
  }

  /** Every file key below a folder, however deep. */
  async function keysBelow(prefix: string): Promise<string[]> {
    const service = storage();
    if (!service.listChildren) {
      return (await service.list(prefix)).files.map((file) => file.key);
    }
    const { files, folders } = await service.listChildren(prefix, {
      limit: 1000,
    });
    const nested = await Promise.all(
      folders.map((folder) => keysBelow(folder.prefix))
    );
    return [...files.map((file) => file.key), ...nested.flat()];
  }

  const adapter: SpaceDataAdapter = {
    alwaysVisible: true,
    createNode: async (ctx, create) => {
      const name = validName(create.name);
      const path = join(...segments(create.parentPath), name);
      if (create.kind === "folder") {
        await storage().upload(
          `${keyOf(ctx, path)}/${FOLDER_PLACEHOLDER}`,
          new Uint8Array(),
          { contentType: "text/plain", upsert: true }
        );
        return {
          kind: "record",
          members: [],
          name,
          nodeType: SPACE_FILE_NODE_TYPE,
          path,
          recordId: keyOf(ctx, path),
          version: "",
        };
      }
      if (await fileAt(ctx, path)) {
        throw dataConflictError(`${name} already exists`);
      }
      await storage().upload(
        keyOf(ctx, path),
        bytesOf(create.content ?? "", create.encoding),
        { contentType: guessFileStorageMimeFromFilename(name) }
      );
      return await readDocument(ctx, path);
    },
    deleteNode: async (ctx, remove) => {
      const file = await fileAt(ctx, remove.path);
      if (file) {
        const version = file.updated_at || file.created_at;
        if (remove.baseVersion && remove.baseVersion !== version) {
          throw dataConflictError("The file changed since you read it");
        }
        await storage().delete(file.key);
        return { deleted: true };
      }
      const keys = await keysBelow(`${keyOf(ctx, remove.path)}/`);
      if (keys.length === 0) {
        throw notFoundError(
          "not_found",
          `Nothing at ${input.root}/${remove.path}`
        );
      }
      if (
        !remove.recursive &&
        keys.some((key) => !key.endsWith(`/${FOLDER_PLACEHOLDER}`))
      ) {
        throw new PluginOperationError(
          "folder_not_empty",
          "The folder is not empty",
          { status: 409 }
        );
      }
      await Promise.all(keys.map((key) => storage().delete(key)));
      return { deleted: true };
    },
    label: input.label,
    list: async (ctx, path): Promise<SpaceDataListing> => {
      const service = storage();
      const prefix = `${keyOf(ctx, path)}/`;
      const base = segments(path);
      if (!service.listChildren) {
        const { files } = await service.list(prefix);
        return {
          entries: files
            .filter((file) => !isHidden(file.filename))
            .map((file) => toEntry(join(...base, file.filename), file)),
          folders: [],
        };
      }
      const { files, folders } = await service.listChildren(prefix, {
        limit: 1000,
      });
      return {
        entries: files
          .filter((file) => !isHidden(file.filename))
          .map((file) => toEntry(join(...base, file.filename), file))
          .sort((a, b) => a.name.localeCompare(b.name)),
        folders: folders
          .map((folder) => ({
            name: folder.name,
            path: join(...base, folder.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        ...(files.length + folders.length >= 1000 ? { truncated: true } : {}),
      };
    },
    moduleId: input.moduleId,
    moveNode: async (ctx, move) => {
      const from = segments(move.path);
      const name = move.newName ? validName(move.newName) : from.at(-1);
      if (!name) {
        throw notFoundError("not_found", "Nothing to move");
      }
      const parent =
        move.toParentPath === undefined
          ? from.slice(0, -1)
          : segments(move.toParentPath);
      const to = join(...parent, name);
      if (to === join(...from)) {
        return await readDocument(ctx, to);
      }
      const fromKey = keyOf(ctx, move.path);
      const toKey = keyOf(ctx, to);
      const file = await fileAt(ctx, move.path);
      if (file) {
        const version = file.updated_at || file.created_at;
        if (move.baseVersion && move.baseVersion !== version) {
          throw dataConflictError("The file changed since you read it");
        }
        if (await fileAt(ctx, to)) {
          throw dataConflictError(`${name} already exists there`);
        }
        await storage().copy(fromKey, toKey);
        await storage().delete(fromKey);
        return await readDocument(ctx, to);
      }
      const keys = await keysBelow(`${fromKey}/`);
      if (keys.length === 0) {
        throw notFoundError(
          "not_found",
          `Nothing at ${input.root}/${move.path}`
        );
      }
      for (const key of keys) {
        await storage().copy(key, `${toKey}${key.slice(fromKey.length)}`);
        await storage().delete(key);
      }
      return {
        kind: "record",
        members: [],
        name,
        nodeType: SPACE_FILE_NODE_TYPE,
        path: to,
        recordId: toKey,
        version: "",
      };
    },
    nodeTypes: [FILE_NODE_TYPE],
    peopleOnly: true,
    read: readDocument,
    recordScopes: ["all", "space"],
    root: input.root,
    write: async (ctx, write) => {
      const file = await fileAt(ctx, write.path);
      if (file) {
        const version = file.updated_at || file.created_at;
        if (write.baseVersion !== version) {
          throw dataConflictError("The file changed since you read it");
        }
      }
      const name = segments(write.path).at(-1) ?? "";
      await storage().upload(
        keyOf(ctx, write.path),
        bytesOf(write.content, write.encoding),
        {
          contentType:
            file?.mime_type ||
            guessFileStorageMimeFromFilename(validName(name)),
          upsert: true,
        }
      );
      return await readDocument(ctx, write.path);
    },
  };
  adapter.search = (ctx, search) =>
    searchSpaceDataByWalk(adapter.list, ctx, search);
  return adapter;
}

/** The roots over one Space's folder. */
export function createSpaceFolderAdapters(
  getStorage: () => FileStorageService | null
): SpaceDataAdapter[] {
  return SPACE_FOLDER_ROOTS.map((root) =>
    createSpaceFolderAdapter({ ...root, getStorage })
  );
}
