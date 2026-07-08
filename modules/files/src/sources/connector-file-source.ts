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
  filesList(params: {
    connectionId: string;
    cursor?: string | null;
    folderRef: string | null;
    limit?: number;
    principal: ConnectionPolicyPrincipal;
    tenantId: string;
  }): Promise<{ entries: ConnectorFileEntry[]; next_cursor: string | null }>;
  filesRead(params: {
    connectionId: string;
    fileRef: string;
    principal: ConnectionPolicyPrincipal;
    tenantId: string;
  }): Promise<ConnectorFilesReadResult>;
}

export interface CreateConnectorFileSourceOptions {
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
 * Read half of {@link FileSource} over connector mounts: `folderId` is either a
 * mount-root row (resolved via `getMount`) or a virtual `cnx:` id; entries map
 * to virtual nodes. All mutations throw {@link FileSourceReadOnlyError}.
 */
export function createConnectorFileSource(
  options: CreateConnectorFileSourceOptions
): FileSource {
  const { client, getMount } = options;

  async function resolveNode(
    ctx: FileSourceContext,
    folderId: string
  ): Promise<ResolvedNode> {
    const decoded = decodeConnectorNodeId(folderId);
    if (decoded) {
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
    return {
      connectionId: mount.connectionId,
      ref: mount.sourceFolderId,
      sourceKind: mount.source as FileSourceKind,
    };
  }

  function toNodes(
    node: ResolvedNode,
    parentId: string,
    entries: ConnectorFileEntry[]
  ): Pick<FileSourceListing, "files" | "folders"> {
    const folders: FileSourceFolder[] = [];
    const files: FileSourceFile[] = [];
    for (const entry of entries) {
      const id = encodeConnectorNodeId(node.connectionId, entry.ref);
      if (entry.kind === "folder") {
        folders.push({
          connectionId: node.connectionId,
          createdAt: entry.modified_at ?? "",
          id,
          name: entry.name,
          parentId,
          readOnly: true,
          source: node.sourceKind,
          updatedAt: entry.modified_at ?? "",
        });
      } else {
        files.push({
          createdAt: entry.modified_at ?? "",
          folderId: parentId,
          id,
          mimeType: entry.mime_type ?? "application/octet-stream",
          name: entry.name,
          readOnly: true,
          sizeBytes: entry.size ?? 0,
          source: node.sourceKind,
          sourceFileId: entry.ref,
          updatedAt: entry.modified_at ?? "",
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
      return {
        ...toNodes(node, folderId, entries),
        ...(result.next_cursor ? { cursor: result.next_cursor } : {}),
        readOnly: true,
      };
    },

    async getDownloadUrl(ctx, fileId) {
      const decoded = decodeConnectorNodeId(fileId);
      if (!decoded) {
        throw new FileSourceNotFoundError("Not a connector file");
      }
      const result = await client.filesRead({
        connectionId: decoded.connectionId,
        fileRef: decoded.ref,
        principal: principalFor(ctx),
        tenantId: ctx.tenantId,
      });
      if (result.kind === "url") {
        return result.url;
      }
      // Proxied bytes: the files module's download route streams them; the
      // UI never calls getDownloadUrl for these without that route.
      return `/api/files/spaces/${encodeURIComponent(ctx.owner.type)}/${encodeURIComponent(
        ctx.owner.id
      )}/files/${encodeURIComponent(fileId)}/download`;
    },

    beginUpload: () => readOnly(),
    createFolder: () => readOnly(),
    deleteFile: () => readOnly(),
    deleteFolder: () => readOnly(),
    finalizeUpload: () => readOnly(),
    moveFile: () => readOnly(),
    moveFolder: () => readOnly(),
    renameFile: () => readOnly(),
    renameFolder: () => readOnly(),
  };
}
