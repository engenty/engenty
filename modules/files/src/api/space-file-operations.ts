/**
 * The file space of a SPACE, as module operations (PLAN-space-data-agent-crud
 * P1.3).
 *
 * The file manager's own routes are HTTP only: `registerHttpRoute` files them
 * under `registry.httpRoutes`, which is a different list from
 * `registry.moduleOperations`, so their `operation` block gates the HTTP call
 * and nothing more. That leaves the space's own files reachable by a browser
 * and by nothing else — not by `engenty_tool_execute`, and not by
 * `invokeOperation`, which is the one door the space Data tree may use.
 * Registering them here is what lets the Files adapter exist at all.
 *
 * **Space-scoped on purpose.** Every operation names a `space_id` and builds
 * its owner as `{type: "space", id: space_id}`; there is deliberately no
 * `owner_type`/`owner_id` pair. A free-form owner would make these the first
 * agent-callable way to reach a PROJECT's file space, whose visibility is
 * `resolveWorkVisibility`'s to decide — and routing around work containment is
 * not a side effect a file listing should have. The file manager keeps the
 * project lane on its HTTP routes, where it already is.
 *
 * What still gates a call, none of it written here: the tenant plugin
 * capability, `module.files.read|write` through `evaluatePolicy`, the space
 * mount's `agent_access` (module-granular, so an unmounted `files` blocks these
 * operations inside a space exactly as it hides the root), and the approval
 * escalation every agent principal gets on a risky operation.
 */

import { ConnectionsActionError } from "@engenty/connections-sdk";
import {
  type FileSource,
  FileSourceConflictError,
  type FileSourceContext,
  FileSourceNotFoundError,
  FileSourceReadOnlyError,
  guessFileStorageMimeFromFilename,
} from "@engenty/file-storage";
import {
  dataConflictError,
  forbiddenError,
  isPluginOperationError,
  notFoundError,
  type PluginAuthContext,
  PluginOperationError,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { fileSpaceNodeIdSchema } from "../schema/file-manager-zod.js";
import {
  decodeConnectorNodeId,
  isConnectorNodeId,
} from "../sources/connector-ref.js";

/**
 * How many bytes a read may hand back inline.
 *
 * The same ceiling the save route enforces, for the same reason: these bytes
 * travel through core inside a JSON body. A file above it is not an error, it
 * is a download — so the refusal says so rather than truncating, which would
 * hand an agent a file that looks complete and is not.
 */
const READ_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Content types whose bytes are text.
 *
 * Guessed from the mime type rather than sniffed, because a wrong guess is
 * recoverable here (the caller sees `encoding` and can ask again) while a
 * wrong sniff would silently mangle a file on the way back in.
 */
const TEXT_MIME =
  /^text\/|^application\/(json|xml|yaml|x-yaml|javascript|typescript|sql|toml)|\+json$|\+xml$/;

/**
 * Encoding for an inline read: text as utf-8, everything else as base64.
 *
 * Connectors that omit a mime (local-files) land as `application/octet-stream`.
 * The filename is the other honest signal — the same guess uploads already
 * use — so a `.json` file is not shown as its Base64.
 */
export function spaceFileReadPresentation(file: {
  mimeType: string;
  name: string;
}): { encoding: "base64" | "utf8"; mimeType: string } {
  const mime =
    file.mimeType && file.mimeType !== "application/octet-stream"
      ? file.mimeType
      : guessFileStorageMimeFromFilename(file.name);
  const text = TEXT_MIME.test(mime);
  return { encoding: text ? "utf8" : "base64", mimeType: mime };
}

const spaceIdSchema = z
  .string()
  .uuid()
  .describe("The space whose file space to act in.");

const listInputSchema = z.object({
  folder_id: fileSpaceNodeIdSchema
    .nullish()
    .describe(
      "Folder to list; omit or null for the space's file root. A connected folder beneath a mount is a virtual connector id, not a uuid."
    ),
  space_id: spaceIdSchema,
});

const readInputSchema = z.object({
  file_id: fileSpaceNodeIdSchema.describe(
    "File to read — a file_entries uuid, or a virtual connector id inside a mount."
  ),
  space_id: spaceIdSchema,
});

const folderCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(200).describe("Folder name."),
  parent_id: z
    .string()
    .uuid()
    .nullish()
    .describe("Parent folder; omit or null to create at the file root."),
  space_id: spaceIdSchema,
});

const folderMoveInputSchema = z
  .object({
    folder_id: z.string().uuid().describe("Folder to rename and/or move."),
    name: z.string().trim().min(1).max(200).optional().describe("New name."),
    parent_id: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("New parent; null moves it to the file root."),
    space_id: spaceIdSchema,
  })
  .refine((v) => v.name !== undefined || v.parent_id !== undefined, {
    message: "Provide name and/or parent_id",
  });

const fileMoveInputSchema = z
  .object({
    file_id: fileSpaceNodeIdSchema.describe(
      "File to rename and/or move — a file_entries uuid, or a virtual connector id inside a mount."
    ),
    folder_id: fileSpaceNodeIdSchema
      .nullable()
      .optional()
      .describe(
        "New folder; null moves it to the file root. A connected folder is a virtual connector id, not a uuid."
      ),
    name: z.string().trim().min(1).max(400).optional().describe("New name."),
    space_id: spaceIdSchema,
  })
  .refine((v) => v.name !== undefined || v.folder_id !== undefined, {
    message: "Provide name and/or folder_id",
  });

const writeInputSchema = z.object({
  content: z.string().max(READ_MAX_BYTES).describe("The file's new bytes."),
  encoding: z
    .enum(["base64", "utf8"])
    .default("utf8")
    .describe("How `content` is encoded. Stated, never guessed."),
  /**
   * REQUIRED, and that is the design.
   *
   * Editing a file is the one path where two people working on the same thing
   * is ordinary rather than exotic, so a save that cannot be checked is a save
   * that silently discards somebody's work. Without a token the only available
   * behaviour is last-write-wins.
   */
  expected_version: z
    .string()
    .min(1)
    .describe("The updatedAt the writer read. A newer row answers 409."),
  file_id: fileSpaceNodeIdSchema.describe(
    "File to overwrite — a file_entries uuid, or a virtual connector id inside a mount."
  ),
  space_id: spaceIdSchema,
});

const folderDeleteInputSchema = z.object({
  folder_id: z.string().uuid().describe("Folder to delete."),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Take the children too. A folder delete CASCADES to every file inside it and their stored bytes."
    ),
  space_id: spaceIdSchema,
});

const fileDeleteInputSchema = z.object({
  file_id: fileSpaceNodeIdSchema.describe(
    "File to delete — a file_entries uuid, or a virtual connector id inside a mount."
  ),
  space_id: spaceIdSchema,
});

const READ_OP = {
  idempotent: true,
  moduleId: "files" as const,
  requiredCapabilities: ["module.files.read"],
  riskLevel: "low" as const,
};

/**
 * Create and move are `medium`, and that is the decision, not an oversight.
 *
 * An agent principal is escalated to an approval on `high`/`critical`
 * (`policy.ts`), so the level chosen here decides whether a headless agent can
 * make a folder unattended. Create and move are additive and recoverable —
 * nothing is lost by either — which is exactly why this slice ships them and
 * not delete. Delete cascades to children AND their blobs; when it lands it
 * lands as `high`.
 */
const WRITE_OP = {
  moduleId: "files" as const,
  requiredCapabilities: ["module.files.write"],
  riskLevel: "medium" as const,
};

/**
 * Delete is `high`, which is what makes an agent ask before it fires.
 *
 * `evaluatePolicy` escalates any agent principal on `high`/`critical` to an
 * approval, so this level is not documentation — it is the gate. A folder
 * delete cascades to every child AND to their stored bytes, and it is the one
 * operation in this file that cannot be undone by doing the opposite.
 */
const DELETE_OP = {
  moduleId: "files" as const,
  requiredCapabilities: ["module.files.write"],
  riskLevel: "high" as const,
};

/** Collection/create: bind to the required `space_id`, no row lookup. */
const SPACE_OWNED_COLLECTION = {
  kind: "space_owned" as const,
  spaceInputKey: "space_id" as const,
};

/** get/update/delete of a folder row — Space comes from `file_folders`. */
const SPACE_OWNED_FOLDER = {
  kind: "space_owned" as const,
  record: { idInputKey: "folder_id", moduleId: "files" },
  spaceInputKey: "space_id" as const,
};

/**
 * Base64 → bytes, refusing anything that is not what it claims to be.
 *
 * `Buffer.from(…, "base64")` accepts a good deal of near-base64 and quietly
 * produces garbage, so the decode is verified by re-encoding: a payload that
 * does not survive the round trip is rejected rather than written over
 * somebody's file. The same check the HTTP save route makes.
 */
function decodeBase64(content: string): Uint8Array | null {
  try {
    const bytes = Uint8Array.from(Buffer.from(content, "base64"));
    return Buffer.from(bytes).toString("base64") === content.replace(/\s/g, "")
      ? bytes
      : null;
  } catch {
    return null;
  }
}

function spaceContext(
  auth: PluginAuthContext | undefined,
  spaceId: string
): FileSourceContext {
  if (!auth?.tenantId) {
    throw forbiddenError(
      "unauthenticated",
      "File space operations require authentication."
    );
  }
  return {
    owner: { id: spaceId, type: "space" },
    // Redundant by construction for a space owner — the owner id IS the space —
    // but stated so the key builder never has to infer it.
    spaceId,
    tenantId: auth.tenantId,
    ...(auth.principalId ? { principalId: auth.principalId } : {}),
  };
}

/**
 * File-source failures, translated into the protocol's own vocabulary.
 *
 * `FileSourceConflictError` becomes `data_conflict` rather than a bespoke code
 * because the space data tree already teaches every caller one recovery for
 * "somebody changed it": re-read and re-apply. Two names for one outcome would
 * mean two client paths where one works.
 */
async function translating<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FileSourceNotFoundError) {
      throw notFoundError("file_not_found", error.message);
    }
    if (error instanceof FileSourceReadOnlyError) {
      throw forbiddenError(
        "file_read_only",
        error.message.trim() || "This file cannot be saved here."
      );
    }
    if (error instanceof FileSourceConflictError) {
      throw dataConflictError(error.message, {
        currentVersion: error.currentUpdatedAt,
      });
    }
    if (error instanceof ConnectionsActionError) {
      throw new PluginOperationError(error.code, error.message, {
        status: error.code === "connection_approval_pending" ? 202 : 403,
        ...(Object.keys(error.details).length > 0
          ? { details: error.details }
          : {}),
      });
    }
    if (isPluginOperationError(error)) {
      throw error;
    }
    if (
      error instanceof Error &&
      /local_files_|connection_|files_write|has no action files_/.test(
        error.message
      )
    ) {
      throw new PluginOperationError("file_connector_failed", error.message, {
        status: 400,
      });
    }
    throw error;
  }
}

export function registerSpaceFileOperations(
  api: PluginServerApi,
  source: FileSource
): void {
  api.registerOperation({
    ...READ_OP,
    description:
      "List one folder of a space's own file space. Omit folder_id for the root. Returns folders and files with their ids, names and updatedAt.",
    inputSchema: listInputSchema,
    operationId: "files_space_list",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "List a space file folder",
    handler: async (input, ctx) => {
      const { folder_id, space_id } = listInputSchema.parse(input ?? {});
      return translating(() =>
        source.listFolder(spaceContext(ctx.auth, space_id), folder_id ?? null)
      );
    },
  });

  api.registerOperation({
    ...READ_OP,
    description:
      "Read one file's bytes from a space's file space. Text content types come back as utf-8; everything else is base64. Files above 5 MB are refused rather than truncated — fetch those as a download.",
    inputSchema: readInputSchema,
    operationId: "files_space_read",
    outputSchema: z.unknown(),
    // Collection, not a file_entries lookup: a file inside a connected folder
    // is a virtual `cnx:` id with no row. locateSpaceFile reads that id
    // directly instead of walking every mount.
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "Read a space file",
    handler: async (input, ctx) => {
      const { file_id, space_id } = readInputSchema.parse(input ?? {});
      const sctx = spaceContext(ctx.auth, space_id);
      return translating(async () => {
        const file = await locateSpaceFile(source, sctx, file_id);
        if (file.sizeBytes > READ_MAX_BYTES) {
          throw new PluginOperationError(
            "file_too_large",
            `This file is ${file.sizeBytes} bytes; only files up to ${READ_MAX_BYTES} can be read inline.`,
            { status: 413 }
          );
        }
        const bytes = Buffer.from(await source.readBytes(sctx, file_id));
        if (bytes.byteLength > READ_MAX_BYTES) {
          throw new PluginOperationError(
            "file_too_large",
            `This file is ${bytes.byteLength} bytes; only files up to ${READ_MAX_BYTES} can be read inline.`,
            { status: 413 }
          );
        }
        const { encoding, mimeType } = spaceFileReadPresentation(file);
        return {
          content:
            encoding === "utf8"
              ? bytes.toString("utf8")
              : bytes.toString("base64"),
          encoding,
          file: { ...file, mimeType },
        };
      });
    },
  });

  api.registerOperation({
    ...WRITE_OP,
    description:
      "Replace a file's bytes in a space's file space, keeping its id, name and folder. Requires the expected_version you read; a newer row answers 409 rather than overwriting.",
    inputSchema: writeInputSchema,
    operationId: "files_space_write",
    outputSchema: z.unknown(),
    // Collection: a connected file is a virtual `cnx:` id with no
    // `file_entries` row. findFile already walks THIS space's tree.
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "Save a space file's content",
    handler: async (input, ctx) => {
      const { content, encoding, expected_version, file_id, space_id } =
        writeInputSchema.parse(input ?? {});
      const data =
        encoding === "base64"
          ? decodeBase64(content)
          : new TextEncoder().encode(content);
      if (!data) {
        throw new PluginOperationError(
          "invalid_encoding",
          "content is not valid base64.",
          { status: 400 }
        );
      }
      if (data.byteLength > READ_MAX_BYTES) {
        throw new PluginOperationError(
          "file_too_large",
          `These bytes are ${data.byteLength}; the inline save ceiling is ${READ_MAX_BYTES}.`,
          { status: 413 }
        );
      }
      return translating(() =>
        source.replaceContent(spaceContext(ctx.auth, space_id), file_id, {
          data,
          expectedUpdatedAt: expected_version,
        })
      );
    },
  });

  api.registerOperation({
    ...WRITE_OP,
    description:
      "Create a folder in a space's own file space. Sibling folder names are unique, so creating one that already exists fails rather than merging.",
    inputSchema: folderCreateInputSchema,
    operationId: "files_space_folder_create",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "Create a space file folder",
    handler: async (input, ctx) => {
      const { name, parent_id, space_id } = folderCreateInputSchema.parse(
        input ?? {}
      );
      return translating(() =>
        source.createFolder(
          spaceContext(ctx.auth, space_id),
          parent_id ?? null,
          name
        )
      );
    },
  });

  api.registerOperation({
    ...WRITE_OP,
    description:
      "Rename a folder, move it under a different parent, or both. parent_id null moves it to the file root.",
    inputSchema: folderMoveInputSchema,
    operationId: "files_space_folder_move",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_FOLDER,
    summary: "Rename or move a space file folder",
    handler: async (input, ctx) => {
      const { folder_id, name, parent_id, space_id } =
        folderMoveInputSchema.parse(input ?? {});
      const sctx = spaceContext(ctx.auth, space_id);
      return translating(async () => {
        // Rename first, then re-parent: the second call returns the row as it
        // finally stands, so the caller is never handed a half-applied node.
        let folder = await (name === undefined
          ? Promise.resolve(null)
          : source.renameFolder(sctx, folder_id, name));
        if (parent_id !== undefined) {
          folder = await source.moveFolder(sctx, folder_id, parent_id);
        }
        return folder;
      });
    },
  });

  api.registerOperation({
    ...DELETE_OP,
    description:
      "Delete a folder from a space's file space. THIS CASCADES: every file inside it, at any depth, is removed along with its stored bytes. Pass recursive:true to confirm you mean that; a folder with children is refused without it.",
    inputSchema: folderDeleteInputSchema,
    operationId: "files_space_folder_delete",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_FOLDER,
    summary: "Delete a space file folder (cascades)",
    handler: async (input, ctx) => {
      const { folder_id, recursive, space_id } = folderDeleteInputSchema.parse(
        input ?? {}
      );
      const sctx = spaceContext(ctx.auth, space_id);
      return translating(async () => {
        if (!recursive) {
          // The underlying delete cascades unconditionally, so "are you sure"
          // has to be asked HERE or not at all. Refusing a non-empty folder
          // when the caller did not ask for a cascade is the difference
          // between a delete and a surprise.
          const listing = await source.listFolder(sctx, folder_id);
          const children = listing.files.length + listing.folders.length;
          if (children > 0) {
            throw new PluginOperationError(
              "folder_not_empty",
              `This folder holds ${children} item(s) and deleting it removes them and their stored bytes. Pass recursive:true if that is what you mean.`,
              { details: { children }, status: 409 }
            );
          }
        }
        await source.deleteFolder(sctx, folder_id);
        return { deleted: true };
      });
    },
  });

  api.registerOperation({
    ...DELETE_OP,
    description:
      "Delete one file from a space's file space, removing its stored bytes.",
    inputSchema: fileDeleteInputSchema,
    operationId: "files_space_file_delete",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "Delete a space file",
    handler: async (input, ctx) => {
      const { file_id, space_id } = fileDeleteInputSchema.parse(input ?? {});
      return translating(async () => {
        await source.deleteFile(spaceContext(ctx.auth, space_id), file_id);
        return { deleted: true };
      });
    },
  });

  api.registerOperation({
    ...WRITE_OP,
    description:
      "Rename a file, move it into a different folder, or both. folder_id null moves it to the file root.",
    inputSchema: fileMoveInputSchema,
    operationId: "files_space_file_move",
    outputSchema: z.unknown(),
    spacePolicy: SPACE_OWNED_COLLECTION,
    summary: "Rename or move a space file",
    handler: async (input, ctx) => {
      const { file_id, folder_id, name, space_id } = fileMoveInputSchema.parse(
        input ?? {}
      );
      const sctx = spaceContext(ctx.auth, space_id);
      return translating(async () => {
        let file = await (name === undefined
          ? Promise.resolve(null)
          : source.renameFile(sctx, file_id, name));
        if (folder_id !== undefined) {
          file = await source.moveFile(sctx, file_id, folder_id);
        }
        return file;
      });
    },
  });
}

/**
 * Locate one file for an inline read.
 *
 * A connected file's id already names the provider path (`cnx:…`). Walking
 * the tree to find it would list every mount through the browser bridge —
 * the thing that made every Data-tree click wait on the slowest connected
 * folder. Native files still have no `getFile`, so those walk native folders
 * only (never into a mount: a uuid cannot live there).
 */
async function locateSpaceFile(
  source: FileSource,
  ctx: FileSourceContext,
  fileId: string
) {
  if (isConnectorNodeId(fileId)) {
    const name = connectorFileName(fileId);
    if (!name) {
      throw notFoundError("file_not_found", "Not a connector file");
    }
    return {
      createdAt: "",
      folderId: null,
      id: fileId,
      mimeType: guessFileStorageMimeFromFilename(name),
      name,
      sizeBytes: 0,
      source: "native" as const,
      updatedAt: "",
    };
  }
  const queue: Array<string | null> = [null];
  let visited = 0;
  while (queue.length > 0 && visited < 200) {
    const folderId = queue.shift() ?? null;
    visited += 1;
    const listing = await source.listFolder(ctx, folderId);
    const found = listing.files.find((file) => file.id === fileId);
    if (found) {
      return found;
    }
    for (const folder of listing.folders) {
      // A mount's children are virtual `cnx:` ids. Recursing into one looking
      // for a native uuid is a round trip through the connector that cannot
      // succeed and is what made opening a file in Files/ wait on every
      // connected folder in the space.
      if (isConnectorNodeId(folder.id) || folder.connectionId) {
        continue;
      }
      queue.push(folder.id);
    }
  }
  throw notFoundError("file_not_found", "No such file in this space.");
}

/** Last path segment inside a `cnx:` id, or null when the id does not decode. */
function connectorFileName(fileId: string): string | null {
  const decoded = decodeConnectorNodeId(fileId);
  if (!decoded) {
    return null;
  }
  const slash = decoded.ref.lastIndexOf("/");
  return slash === -1 ? decoded.ref : decoded.ref.slice(slash + 1);
}
