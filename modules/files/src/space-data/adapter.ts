/**
 * The space's own files in the space Data tree (PLAN-space-data-agent-crud P1.3).
 *
 * The file space was the last lane the Daten tab drew that no agent could
 * reach. Everything else in the tab is either a module adapter root (which
 * `/data` walks) or a store an agent already has tools for; the space's own
 * folders and files were visible to a person, invisible to an agent, and
 * editable only through a second screen. This adapter closes that by making
 * `Files/` an adapter root like any other — same mount = grant, same
 * `invokeOperation` pipeline, same approval cards.
 *
 * The tree:
 *
 * ```
 * Files/
 *   Verträge/                        ← files.folder, a file_folders row
 *     mietvertrag__<uuid>.pdf        ← files.file, a file_entries row
 *   notizen__<uuid>.md               ← a file at the root
 * ```
 *
 * **Why a file carries its id and a folder does not.** Sibling folder names are
 * unique per parent — two partial unique indexes enforce it — so a folder path
 * resolves to exactly one row and a plain name is honest. Filenames carry NO
 * such constraint: uploading `vertrag.pdf` twice is ordinary, and a tree that
 * resolved that path by picking the first match would open a different file
 * than the one the caller asked for, silently. So a file name is
 * `<stem>__<uuid><ext>` and `title` carries what a reader should see — the same
 * trade the knowledge base makes, for the same reason: identity is the record
 * id, never the path (PLAN-space-data.md §1b).
 *
 * **`record_scope: space` is honest here, and it is the first adapter for which
 * it is.** Contacts and offers carry no `space_id` by design, so a
 * space-scoped mount of them has no answer but "nothing". A space's file space
 * IS addressed by the space — `owner_type='space', owner_id=<spaceId>` — so
 * both scopes mean the same set and both are declared.
 */

import {
  notFoundError,
  notSupportedError,
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

export const FILES_ROOT = "Files";
export const FILES_ROOT_NODE_TYPE = "files.root";
export const FILES_FOLDER_NODE_TYPE = "files.folder";
export const FILES_FILE_NODE_TYPE = "files.file";
/**
 * A connected external folder, kept distinguishable from a native one.
 *
 * The Drive used to know a mount by its `connectionId` and render it as its own
 * kind; coming through the adapter, a folder is a folder. Carrying the
 * distinction as a node type keeps that knowledge in the tree rather than
 * losing it in translation — Phase 2 makes it a write target, and it should not
 * have to rediscover which folders are remote to do so.
 */
export const FILES_MOUNT_NODE_TYPE = "files.mount";

/**
 * The catch-all node type.
 *
 * `extension: ""` matches every name, and `matchSpaceDataNodeType` sorts by
 * extension length so a longer, more specific type always wins over it. That is
 * the right shape for a file space: its whole point is that a file is any type
 * at all, so the generic answer must exist rather than every extension having
 * to be enumerated in advance.
 */
const FILE_NODE_TYPE: SpaceDataNodeType = {
  extension: "",
  id: FILES_FILE_NODE_TYPE,
  kind: "record",
  label: "File",
};

interface FolderRow {
  /** Set on a mount root: the connection whose bytes this folder shows. */
  connectionId?: string;
  id: string;
  name: string;
  parentId: string | null;
  readOnly?: boolean;
  source?: string;
  updatedAt: string;
}

interface FileRow {
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  readOnly?: boolean;
  sizeBytes: number;
  updatedAt: string;
}

interface Listing {
  files: FileRow[];
  folders: FolderRow[];
  readOnly?: boolean;
}

async function listFolder(
  ctx: SpaceDataContext,
  folderId: string | null
): Promise<Listing> {
  const result = (await ctx.invokeOperation("files_space_list", {
    folder_id: folderId,
    space_id: ctx.spaceId,
  })) as Listing | null;
  return { files: result?.files ?? [], folders: result?.folders ?? [] };
}

/** The extension a filename carries, `.tar.gz` counted as `.gz`. */
function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(index) : "";
}

/** `mietvertrag.pdf` + id → `mietvertrag__<id>.pdf`. */
function fileNodeName(file: { id: string; name: string }): string {
  const extension = extensionOf(file.name);
  return spaceDataNodeName({
    extension,
    recordId: file.id,
    title: extension ? file.name.slice(0, -extension.length) : file.name,
  });
}

function entryOf(file: FileRow, parentPath: string): SpaceDataEntry {
  const name = fileNodeName(file);
  return {
    kind: "record",
    name,
    nodeType: FILES_FILE_NODE_TYPE,
    path: parentPath ? `${parentPath}/${name}` : name,
    recordId: file.id,
    // What the file is actually CALLED. `name` carries the id so a path can be
    // resolved without a scan; a tree row showing that is showing plumbing.
    title: file.name,
    updatedAt: file.updatedAt,
    version: file.updatedAt,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

/** A folder is a MOUNT when its bytes come from a connected external account. */
function isMount(folder: FolderRow): boolean {
  return Boolean(
    folder.connectionId || (folder.source && folder.source !== "native")
  );
}

function folderOf(folder: FolderRow, parentPath: string): SpaceDataFolder {
  return {
    name: folder.name,
    nodeType: isMount(folder) ? FILES_MOUNT_NODE_TYPE : FILES_FOLDER_NODE_TYPE,
    path: parentPath ? `${parentPath}/${folder.name}` : folder.name,
    ...(folder.connectionId ? { connectionId: folder.connectionId } : {}),
  };
}

/**
 * Walk a path to the folder it names, by name, one level at a time.
 *
 * Names rather than ids because a folder path is unambiguous by construction
 * (the unique indexes), and because a person typing `Files/Verträge` into the
 * tree should reach the folder they can see. Case-insensitive to match the
 * indexes, which are on `lower(name)` — resolving case-sensitively would refuse
 * a path the database considers taken.
 */
async function resolveFolder(
  ctx: SpaceDataContext,
  segments: string[]
): Promise<{ id: string | null; listing: Listing }> {
  let id: string | null = null;
  let listing = await listFolder(ctx, null);
  for (const segment of segments) {
    const match = listing.folders.find(
      (folder) => folder.name.toLowerCase() === segment.toLowerCase()
    );
    if (!match) {
      throw notFoundError("file_not_found", `No folder "${segment}" here.`);
    }
    id = match.id;
    listing = await listFolder(ctx, id);
  }
  return { id, listing };
}

/**
 * Resolve a node path to the file it names.
 *
 * The last segment must carry an id — a caller who invented `Files/notes.md`
 * gets a 404 rather than the first file whose name happens to look like that.
 */
async function resolveFile(
  ctx: SpaceDataContext,
  path: string
): Promise<{ file: FileRow; parentPath: string }> {
  const segments = spaceDataPathSegments(path);
  const name = segments.at(-1);
  if (!name) {
    throw notFoundError("file_not_found", "A file path names no file.");
  }
  const fileId = spaceDataNodeRecordId(name, extensionOf(name));
  if (!fileId) {
    throw notFoundError(
      "file_not_found",
      `"${name}" does not name a file in this space — a file's name carries its id.`
    );
  }
  const { listing } = await resolveFolder(ctx, segments.slice(0, -1));
  const file = listing.files.find((candidate) => candidate.id === fileId);
  if (!file) {
    throw notFoundError("file_not_found", `No file "${name}" here.`);
  }
  return { file, parentPath: segments.slice(0, -1).join("/") };
}

function documentOf(
  file: FileRow,
  parentPath: string,
  member: {
    content: string;
    encoding: "base64" | "utf8";
  }
): SpaceDataDocument {
  const name = fileNodeName(file);
  return {
    kind: "record",
    members: [
      {
        content: member.content,
        contentType: file.mimeType,
        derived: false,
        editable: file.readOnly !== true,
        encoding: member.encoding,
        name,
      },
    ],
    name,
    nodeType: FILES_FILE_NODE_TYPE,
    path: parentPath ? `${parentPath}/${name}` : name,
    recordId: file.id,
    updatedAt: file.updatedAt,
    version: file.updatedAt,
  };
}

/**
 * A file, read, as the protocol's one-member document.
 *
 * Every path that answers with a FILE goes through here, including a move.
 * A record document carries exactly one member holding its bytes, so handing
 * back an empty member after a rename would be claiming the file is empty —
 * the one thing the document exists to say, said wrongly. One extra read is
 * cheaper than a caller that believes it.
 */
async function readDocument(
  ctx: SpaceDataContext,
  file: FileRow,
  parentPath: string
): Promise<SpaceDataDocument> {
  const result = (await ctx.invokeOperation("files_space_read", {
    file_id: file.id,
    space_id: ctx.spaceId,
  })) as {
    content?: string;
    encoding?: "base64" | "utf8";
    file?: FileRow;
  } | null;
  return documentOf(file, parentPath, {
    content: result?.content ?? "",
    encoding: result?.encoding ?? "utf8",
  });
}

/** A folder, as the document a create returns. Folders carry no bytes. */
function folderDocument(
  folder: FolderRow,
  parentPath: string
): SpaceDataDocument {
  return {
    kind: "bundle",
    members: [],
    name: folder.name,
    nodeType: FILES_FOLDER_NODE_TYPE,
    path: parentPath ? `${parentPath}/${folder.name}` : folder.name,
    recordId: folder.id,
    updatedAt: folder.updatedAt,
    version: folder.updatedAt,
  };
}

export function createFilesSpaceDataAdapter(): SpaceDataAdapter {
  return {
    label: FILES_ROOT,
    moduleId: "files",
    nodeTypes: [FILE_NODE_TYPE],
    recordScopes: ["all", "space"],
    root: FILES_ROOT,
    rootNodeType: FILES_ROOT_NODE_TYPE,

    async list(ctx, path): Promise<SpaceDataListing> {
      const segments = spaceDataPathSegments(path);
      const { listing } = await resolveFolder(ctx, segments);
      return {
        entries: listing.files.map((file) => entryOf(file, path)),
        folders: listing.folders.map((folder) => folderOf(folder, path)),
        ...(segments.length > 0
          ? {
              self: {
                name: segments.at(-1) ?? FILES_ROOT,
                nodeType: FILES_FOLDER_NODE_TYPE,
                path,
              },
            }
          : {}),
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      const { file, parentPath } = await resolveFile(ctx, path);
      return readDocument(ctx, file, parentPath);
    },

    /**
     * Save an edit to a file's bytes.
     *
     * `baseVersion` travels straight through to the file source's REQUIRED
     * `expectedUpdatedAt`, so the tree inherits the file manager's existing
     * conflict answer rather than growing a second one — a 409 here and a 409
     * in the editor are the same refusal about the same row.
     *
     * A FOLDER refuses: `index.md` is decision 3's shape for folder metadata
     * and the file space has no row to keep it in, so accepting the write
     * would mean silently dropping it.
     */
    async write(ctx, input): Promise<SpaceDataDocument> {
      const { file, parentPath } = await resolveFile(ctx, input.path);
      const saved = (await ctx.invokeOperation("files_space_write", {
        content: input.content,
        expected_version: input.baseVersion,
        file_id: file.id,
        space_id: ctx.spaceId,
        ...(input.encoding ? { encoding: input.encoding } : {}),
      })) as FileRow | null;
      if (!saved) {
        throw notFoundError("file_not_found", "The file could not be saved.");
      }
      return documentOf(saved, parentPath, {
        content: input.content,
        encoding: input.encoding ?? "utf8",
      });
    },

    /**
     * Folders only, for now.
     *
     * A `node` here would be a FILE, and a file is bytes: minting one means an
     * upload ticket, a PUT to storage and a finalize, which is a different
     * shape from "make me an empty thing" and a different failure surface. The
     * refusal names the upload rather than pretending the gesture is
     * unavailable — a caller who is told what to do instead does not retry.
     */
    async createNode(
      ctx: SpaceDataContext,
      input: SpaceDataCreateInput
    ): Promise<SpaceDataDocument> {
      if (input.kind !== "folder") {
        throw notSupportedError(
          "A file is created by uploading its bytes, not by making an empty node — use the file space's upload."
        );
      }
      const { id } = await resolveFolder(
        ctx,
        spaceDataPathSegments(input.parentPath)
      );
      const folder = (await ctx.invokeOperation("files_space_folder_create", {
        name: input.name,
        parent_id: id,
        space_id: ctx.spaceId,
      })) as FolderRow | null;
      if (!folder) {
        throw notFoundError(
          "file_not_found",
          "The folder could not be created here."
        );
      }
      return folderDocument(folder, input.parentPath);
    },

    /**
     * Remove a folder or a file.
     *
     * Branches on what the path resolves to, exactly as `moveNode` does — a
     * name carrying an id is a file, anything else is a folder. `recursive`
     * reaches the folder operation unchanged, where a non-empty folder without
     * it is refused: the underlying delete cascades unconditionally, so the
     * "are you sure" has to be asked there or nowhere.
     */
    async deleteNode(
      ctx: SpaceDataContext,
      input: SpaceDataDeleteInput
    ): Promise<{ deleted: true }> {
      const segments = spaceDataPathSegments(input.path);
      const name = segments.at(-1);
      if (!name) {
        throw notFoundError(
          "file_not_found",
          "The file root itself cannot be deleted."
        );
      }
      if (spaceDataNodeRecordId(name, extensionOf(name))) {
        const { file } = await resolveFile(ctx, input.path);
        await ctx.invokeOperation("files_space_file_delete", {
          file_id: file.id,
          space_id: ctx.spaceId,
        });
        return { deleted: true };
      }
      const { id } = await resolveFolder(ctx, segments);
      if (!id) {
        throw notFoundError(
          "file_not_found",
          "The file root itself cannot be deleted."
        );
      }
      await ctx.invokeOperation("files_space_folder_delete", {
        folder_id: id,
        recursive: input.recursive ?? false,
        space_id: ctx.spaceId,
      });
      return { deleted: true };
    },

    /**
     * Move or rename a folder or a file.
     *
     * The two cases share nothing but their shape: a folder is found by name
     * and a file by the id its name carries, so the branch is on which of the
     * two the path resolves to, not on a flag the caller sets.
     */
    async moveNode(
      ctx: SpaceDataContext,
      input: SpaceDataMoveInput
    ): Promise<SpaceDataDocument> {
      const segments = spaceDataPathSegments(input.path);
      const name = segments.at(-1);
      if (!name) {
        throw notFoundError("file_not_found", "A move names nothing.");
      }
      const destinationSegments =
        input.toParentPath === undefined
          ? null
          : spaceDataPathSegments(input.toParentPath);
      const destinationId = destinationSegments
        ? (await resolveFolder(ctx, destinationSegments)).id
        : undefined;
      const parentPath = destinationSegments
        ? destinationSegments.join("/")
        : segments.slice(0, -1).join("/");

      // A name carrying an id is a FILE; anything else is a folder. The two
      // never collide: a folder name is a plain segment by construction.
      if (spaceDataNodeRecordId(name, extensionOf(name))) {
        const { file } = await resolveFile(ctx, input.path);
        const moved = (await ctx.invokeOperation("files_space_file_move", {
          file_id: file.id,
          space_id: ctx.spaceId,
          ...(destinationId === undefined ? {} : { folder_id: destinationId }),
          ...(input.newName ? { name: input.newName } : {}),
        })) as FileRow | null;
        if (!moved) {
          throw notFoundError("file_not_found", "The file could not be moved.");
        }
        return readDocument(ctx, moved, parentPath);
      }

      const { id } = await resolveFolder(ctx, segments);
      if (!id) {
        throw notFoundError(
          "file_not_found",
          "The file root itself cannot be moved."
        );
      }
      const moved = (await ctx.invokeOperation("files_space_folder_move", {
        folder_id: id,
        space_id: ctx.spaceId,
        ...(destinationId === undefined ? {} : { parent_id: destinationId }),
        ...(input.newName ? { name: input.newName } : {}),
      })) as FolderRow | null;
      if (!moved) {
        throw notFoundError("file_not_found", "The folder could not be moved.");
      }
      return folderDocument(moved, parentPath);
    },
  };
}
