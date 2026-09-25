import type {
  ConnectionPolicyPrincipal,
  ConnectorFileEntry,
  ConnectorFilesReadResult,
} from "@engenty/connections-sdk";
import {
  type FileSource,
  type FileSourceContext,
  type FileSourceFile,
  type FileSourceFolder,
  type FileSourceKind,
  type FileSourceListing,
  FileSourceNotFoundError,
  FileSourceReadOnlyError,
  guessFileStorageMimeFromFilename,
} from "@engenty/file-storage";
import {
  decodeConnectorNodeId,
  encodeConnectorNodeId,
} from "./connector-ref.js";

/** A `file_folders` row that mounts a connector folder into the space. */
export interface ConnectorMountRow {
  connectionId: string;
  createdAt: string;
  id: string;
  name: string;
  parentId: string | null;
  source: string;
  /** Provider folder ref the mount points at; null = provider root. */
  sourceFolderId: string | null;
  updatedAt: string;
}

/** The slice of the connections module client the connector source needs. */
export interface ConnectorFilesClient {
  filesDelete?(params: {
    connectionId: string;
    principal: ConnectionPolicyPrincipal;
    ref: string;
    tenantId: string;
  }): Promise<{ deleted: boolean; ref: string }>;
  filesList(params: {
    connectionId: string;
    cursor?: string | null;
    folderRef: string | null;
    limit?: number;
    principal: ConnectionPolicyPrincipal;
    tenantId: string;
  }): Promise<{ entries: ConnectorFileEntry[]; next_cursor: string | null }>;
  filesMove?(params: {
    connectionId: string;
    newName?: string;
    principal: ConnectionPolicyPrincipal;
    ref: string;
    tenantId: string;
    toFolderRef: string | null;
  }): Promise<ConnectorFileEntry>;
  filesRead(params: {
    connectionId: string;
    fileRef: string;
    principal: ConnectionPolicyPrincipal;
    tenantId: string;
  }): Promise<ConnectorFilesReadResult>;
  filesStat?(params: {
    connectionId: string;
    principal: ConnectionPolicyPrincipal;
    ref: string;
    tenantId: string;
  }): Promise<ConnectorFileEntry>;
  filesWrite?(params: {
    connectionId: string;
    contentBase64?: string;
    contentText?: string;
    folderRef: string | null;
    mimeType?: string | null;
    name: string;
    principal: ConnectionPolicyPrincipal;
    tenantId: string;
  }): Promise<ConnectorFileEntry>;
  /**
   * Can this connection's connector WRITE at all?
   *
   * Asked rather than attempted, because a mount whose connector declares no
   * `storage` must render as read-only instead of offering an action that will
   * fail — the same principle as invoices refusing an issued invoice before the
   * version check. A protocol that only finds out by trying teaches callers to
   * retry.
   */
  isStorageCapable?(params: {
    connectionId: string;
    tenantId: string;
  }): Promise<boolean>;
}

export interface CreateConnectorFileSourceOptions {
  /**
   * Throw unless this file space may use the connection. A drive belongs to
   * one Space (PLAN-space-owned-connections.md) and node ids are
   * client-supplied, so every provider call is checked here — the connections
   * SDK does not narrow a call that names its connection directly.
   */
  assertConnectionUsable(
    ctx: FileSourceContext,
    connectionId: string
  ): Promise<void>;
  client: ConnectorFilesClient;
  /** Resolve a mount root row within the space; null when `folderId` isn't one. */
  getMount(
    ctx: FileSourceContext,
    folderId: string
  ): Promise<ConnectorMountRow | null>;
}

interface ResolvedNode {
  connectionId: string;
  ref: string | null;
  sourceKind: FileSourceKind;
}

function listingParentRef(nodeRef: string | null): string {
  // `null` on a resolved mount means the connection ROOT, not "parent unknown".
  // Encode that as `""` so writes can pass `folder_ref: null`. Omitting the
  // parent segment is reserved for legacy ids minted before parents were
  // carried, which refuse rather than guess.
  return nodeRef ?? "";
}

function writeFolderRef(parentRef: string | null): string | null {
  if (parentRef === null) {
    throw new FileSourceReadOnlyError(
      "This file's position in the connected folder is not known — reopen the folder and try again."
    );
  }
  return parentRef === "" ? null : parentRef;
}

function principalFor(ctx: FileSourceContext): ConnectionPolicyPrincipal {
  if (!ctx.principalId) {
    throw new Error("connector file source requires a principal");
  }
  return { principalId: ctx.principalId, principalType: "user" };
}

function readOnly(): never {
  throw new FileSourceReadOnlyError();
}

/**
 * A mutation the connector cannot express, refused by NAME.
 *
 * The storage capability is `write` / `delete` / `move` over FILES. It has no
 * folder verbs at all, so creating, renaming, moving or deleting a folder
 * inside a mount is not a permission we lack — it is a gesture the provider
 * contract does not have. Saying which is the difference between a caller that
 * stops and one that retries.
 */
function noFolderOps(): never {
  throw new FileSourceReadOnlyError(
    "Connected folders expose file writes only — creating, renaming or deleting a FOLDER is not part of the connector's storage capability. Do it in the provider."
  );
}

/**
 * Turn a connector read into bytes without going through HTTP.
 *
 * `url` results are fetched (those URLs are absolute). `text` / `base64`
 * results already carry the payload — local-files and Drive proxy — and must
 * not be turned into a relative `/download` path for Node `fetch`.
 */
export async function bytesFromConnectorRead(
  result: ConnectorFilesReadResult
): Promise<Uint8Array> {
  if (result.kind === "url") {
    let response: Response;
    try {
      response = await fetch(result.url);
    } catch {
      throw new FileSourceNotFoundError("File not found");
    }
    if (!response.ok) {
      throw new FileSourceNotFoundError("File not found");
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (result.kind === "base64") {
    return Uint8Array.from(Buffer.from(result.content_base64, "base64"));
  }
  return new TextEncoder().encode(result.content);
}

/**
 * Read half of {@link FileSource} over connector mounts: `folderId` is either a
 * mount-root row (resolved via `getMount`) or a virtual `cnx:` id; entries map
 * to virtual nodes. File writes/deletes go through the connector's storage
 * capability when the connection declares one.
 */
export function createConnectorFileSource(
  options: CreateConnectorFileSourceOptions
): FileSource {
  const { assertConnectionUsable, client, getMount } = options;

  /** A client-supplied `cnx:` id, decoded and checked against this Space. */
  async function usableConnectorId(ctx: FileSourceContext, nodeId: string) {
    const decoded = decodeConnectorNodeId(nodeId);
    if (!decoded) {
      throw new FileSourceNotFoundError("Not a connector file");
    }
    await assertConnectionUsable(ctx, decoded.connectionId);
    return decoded;
  }

  async function resolveNode(
    ctx: FileSourceContext,
    folderId: string
  ): Promise<ResolvedNode> {
    const decoded = decodeConnectorNodeId(folderId);
    if (decoded) {
      await assertConnectionUsable(ctx, decoded.connectionId);
      return {
        connectionId: decoded.connectionId,
        ref: decoded.ref,
        // Virtual ids don't carry the kind; the UI keys badges off the mount
        // root, so a generic connector kind is fine here.
        sourceKind: "native",
      };
    }
    const mount = await getMount(ctx, folderId);
    if (!mount) {
      throw new FileSourceNotFoundError("Mounted folder not found");
    }
    await assertConnectionUsable(ctx, mount.connectionId);
    return {
      connectionId: mount.connectionId,
      ref: mount.sourceFolderId,
      sourceKind: mount.source as FileSourceKind,
    };
  }

  /** One provider entry as a file node, carrying its parent so writes can address it. */
  function connectorFile(
    entry: ConnectorFileEntry,
    connectionId: string,
    parentId: string,
    parentRef: string | null,
    writable = true
  ): FileSourceFile {
    return {
      createdAt: entry.modified_at ?? "",
      folderId: parentId || null,
      id: encodeConnectorNodeId(connectionId, entry.ref, parentRef),
      // Local-files (and some S3 listings) send no mime; octet-stream would
      // make a `.json` / `.md` file look binary and the Data pane would show
      // its Base64 instead of the text.
      mimeType:
        entry.mime_type?.trim() || guessFileStorageMimeFromFilename(entry.name),
      name: entry.name,
      readOnly: !writable,
      sizeBytes: entry.size ?? 0,
      source: "native",
      sourceFileId: entry.ref,
      updatedAt: entry.modified_at ?? "",
    };
  }

  function toNodes(
    node: ResolvedNode,
    parentId: string,
    entries: ConnectorFileEntry[],
    writable: boolean
  ): Pick<FileSourceListing, "files" | "folders"> {
    const folders: FileSourceFolder[] = [];
    const files: FileSourceFile[] = [];
    for (const entry of entries) {
      if (entry.kind === "folder") {
        folders.push({
          connectionId: node.connectionId,
          createdAt: entry.modified_at ?? "",
          id: encodeConnectorNodeId(
            node.connectionId,
            entry.ref,
            listingParentRef(node.ref)
          ),
          name: entry.name,
          parentId,
          // A FOLDER inside a mount stays read-only however capable the
          // connector is: the storage capability has file verbs only.
          readOnly: true,
          source: node.sourceKind,
          updatedAt: entry.modified_at ?? "",
        });
      } else {
        files.push({
          ...connectorFile(
            entry,
            node.connectionId,
            parentId,
            listingParentRef(node.ref),
            writable
          ),
          source: node.sourceKind,
        });
      }
    }
    return { files, folders };
  }

  return {
    kind: "native",

    async listFolder(ctx, folderId, listOptions) {
      if (!folderId) {
        throw new FileSourceNotFoundError(
          "connector source cannot list the space root"
        );
      }
      const node = await resolveNode(ctx, folderId);
      const result = await client.filesList({
        connectionId: node.connectionId,
        cursor: listOptions?.cursor ?? null,
        folderRef: node.ref,
        ...(listOptions?.limit === undefined
          ? {}
          : { limit: listOptions.limit }),
        principal: principalFor(ctx),
        tenantId: ctx.tenantId,
      });
      const search = listOptions?.search?.toLowerCase();
      const entries = search
        ? result.entries.filter((entry) =>
            entry.name.toLowerCase().includes(search)
          )
        : result.entries;
      // Capability NEGOTIATED, not guessed (P2.2). The listing says whether
      // this connection can be written, so the tree renders a read-only mount
      // as read-only instead of offering an action that would fail. A client
      // without the check answers "not writable", which is the safe direction.
      const writable =
        (await client.isStorageCapable?.({
          connectionId: node.connectionId,
          tenantId: ctx.tenantId,
        })) ?? false;
      return {
        ...toNodes(node, folderId, entries, writable),
        ...(result.next_cursor ? { cursor: result.next_cursor } : {}),
        readOnly: !writable,
      };
    },

    async getDownloadUrl(ctx, fileId) {
      // Only builds the proxy URL; the download route checks the connection.
      if (!decodeConnectorNodeId(fileId)) {
        throw new FileSourceNotFoundError("Not a connector file");
      }
      // Always the proxy path. Asking filesRead here would pull a local-files
      // PDF through the bridge just to learn it is not a signed URL — then the
      // iframe would pull it again. /download still 302s when the provider
      // DID return a URL.
      return `/api/files/spaces/${encodeURIComponent(ctx.owner.type)}/${encodeURIComponent(
        ctx.owner.id
      )}/files/${encodeURIComponent(fileId)}/download`;
    },

    async readBytes(ctx, fileId) {
      const decoded = await usableConnectorId(ctx, fileId);
      const result = await client.filesRead({
        connectionId: decoded.connectionId,
        fileRef: decoded.ref,
        principal: principalFor(ctx),
        tenantId: ctx.tenantId,
      });
      return bytesFromConnectorRead(result);
    },

    /**
     * Delete a mounted file through the connector (P2.2).
     *
     * `files_delete` is group `destructive`, so it is ask-by-default at the
     * connection's own policy — a space mount does not get to downgrade that,
     * and this code deliberately has no way to.
     */
    async deleteFile(ctx, fileId) {
      const decoded = await usableConnectorId(ctx, fileId);
      if (!client.filesDelete) {
        readOnly();
      }
      await client.filesDelete({
        connectionId: decoded.connectionId,
        principal: principalFor(ctx),
        ref: decoded.ref,
        tenantId: ctx.tenantId,
      });
    },

    async moveFile(ctx, fileId, newFolderId) {
      const decoded = await usableConnectorId(ctx, fileId);
      if (!client.filesMove) {
        readOnly();
      }
      // The destination must be inside a mount of the SAME connection: the
      // provider moves within its own account, and a "move" that crossed
      // accounts would silently be a copy-and-delete across a trust boundary.
      const destination = newFolderId
        ? await resolveNode(ctx, newFolderId)
        : null;
      if (destination && destination.connectionId !== decoded.connectionId) {
        throw new FileSourceReadOnlyError(
          "A connected file moves inside its own connection. Copy it instead to reach another account."
        );
      }
      const entry = await client.filesMove({
        connectionId: decoded.connectionId,
        principal: principalFor(ctx),
        ref: decoded.ref,
        tenantId: ctx.tenantId,
        toFolderRef: destination?.ref ?? null,
      });
      return connectorFile(
        entry,
        decoded.connectionId,
        newFolderId ?? "",
        destination?.ref ?? null
      );
    },

    async renameFile(ctx, fileId, name) {
      const decoded = await usableConnectorId(ctx, fileId);
      if (!client.filesMove) {
        readOnly();
      }
      const toFolderRef = writeFolderRef(decoded.parentRef);
      const entry = await client.filesMove({
        connectionId: decoded.connectionId,
        newName: name,
        principal: principalFor(ctx),
        ref: decoded.ref,
        tenantId: ctx.tenantId,
        toFolderRef,
      });
      return connectorFile(entry, decoded.connectionId, "", toFolderRef ?? "");
    },

    /**
     * Save an edit to a mounted file.
     *
     * The capability writes by `folder_ref` + `name`, not by ref, so the name
     * is fetched with `files_stat` rather than assumed — and OVERWRITE
     * SEMANTICS ARE THE PROVIDER'S. Local-files and S3 both replace the same
     * path; a provider that instead creates a second file with the same name
     * would need its own `storage.write` to say so. Noted here because the
     * alternative is finding out from a user's duplicated document.
     *
     * `expectedUpdatedAt` cannot be enforced against a provider that offers no
     * compare-and-set, so the conflict guarantee the native source gives does
     * NOT hold here, and this comment is the only honest place to say it.
     */
    async replaceContent(ctx, fileId, input) {
      const decoded = await usableConnectorId(ctx, fileId);
      if (!(client.filesWrite && client.filesStat)) {
        readOnly();
      }
      const folderRef = writeFolderRef(decoded.parentRef);
      const principal = principalFor(ctx);
      const current = await client.filesStat({
        connectionId: decoded.connectionId,
        principal,
        ref: decoded.ref,
        tenantId: ctx.tenantId,
      });
      const entry = await client.filesWrite({
        connectionId: decoded.connectionId,
        contentBase64: Buffer.from(input.data).toString("base64"),
        folderRef,
        name: current.name,
        principal,
        tenantId: ctx.tenantId,
        ...(current.mime_type ? { mimeType: current.mime_type } : {}),
      });
      return connectorFile(entry, decoded.connectionId, "", folderRef ?? "");
    },

    // Uploading a NEW file into a mount is `files_write` too, but the
    // FileSource upload contract is a two-step ticket over OUR storage (mint a
    // key, PUT bytes, finalize) and a provider write has no such key. Wiring it
    // would mean inventing a staging step; a direct write path is the honest
    // shape and Phase 3 gives it a home.
    // `async` so the refusal is a REJECTED promise, not a synchronous throw.
    // Every `FileSource` method is declared to return one, and a caller that
    // only attaches `.catch()` — which the declaration entitles them to — would
    // otherwise get an exception thrown past their handler.
    beginUpload: async () => readOnly(),
    finalizeUpload: async () => readOnly(),
    // No folder verbs exist in the storage capability at all.
    createFolder: async () => noFolderOps(),
    deleteFolder: async () => noFolderOps(),
    moveFolder: async () => noFolderOps(),
    renameFolder: async () => noFolderOps(),
  };
}
