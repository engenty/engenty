/**
 * Extra facts for Get Info / Permissions on a Files-tree node.
 *
 * The data adapter lists names and ids; size, MIME, the mount's connection and
 * the provider path live on the file-space listing. Walking that listing when
 * the inspector opens (the tree's own cache is a different key) is cheaper
 * than growing a second protocol for one dialog.
 */
import {
  type DriveNode,
  type FileSpaceOwnerRef,
  type SpaceDriveFile,
  type SpaceDriveFolder,
  spaceDriveRootOwner,
} from "@engenty/file-storage";
import { useQuery } from "@engenty/query-client";
import { getFileSpaceListing } from "@/lib/api/space-drive-client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { isFilesTreeFile, isFilesTreeNode } from "./connected-folder";

const FILES_ROOT = "Files";
const CNX_PREFIX = "cnx:";

export interface DecodedConnectorId {
  connectionId: string;
  parentRef: string | null;
  ref: string;
}

export interface FileSpaceNodeFacts {
  connectionId: string | null;
  createdAt?: string;
  mimeType?: string;
  /** Provider path inside the granted folder, when this is a connected node. */
  originalRef: string | null;
  readOnly: boolean;
  sizeBytes?: number;
  source?: string;
  updatedAt?: string;
}

function filesRelativeSegments(dataPath: string): string[] {
  if (dataPath === FILES_ROOT) {
    return [];
  }
  const prefix = `${FILES_ROOT}/`;
  const rest = dataPath.startsWith(prefix)
    ? dataPath.slice(prefix.length)
    : dataPath;
  return rest.split("/").filter(Boolean);
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Same codec the files module uses for virtual `cnx:` ids — browser-safe. */
export function decodeConnectorNodeId(id: string): DecodedConnectorId | null {
  if (!id.startsWith(CNX_PREFIX)) {
    return null;
  }
  const rest = id.slice(CNX_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) {
    return null;
  }
  const connectionId = rest.slice(0, sep);
  const tail = rest.slice(sep + 1);
  const parentSep = tail.indexOf(":");
  try {
    return parentSep === -1
      ? { connectionId, parentRef: null, ref: fromBase64Url(tail) }
      : {
          connectionId,
          parentRef: fromBase64Url(tail.slice(parentSep + 1)),
          ref: fromBase64Url(tail.slice(0, parentSep)),
        };
  } catch {
    return null;
  }
}

function factsFromFolder(folder: SpaceDriveFolder): FileSpaceNodeFacts {
  const decoded = decodeConnectorNodeId(folder.id);
  return {
    connectionId: folder.connectionId ?? decoded?.connectionId ?? null,
    originalRef: decoded?.ref || null,
    readOnly: Boolean(folder.readOnly),
    ...(folder.createdAt ? { createdAt: folder.createdAt } : {}),
    ...(folder.source ? { source: folder.source } : {}),
    ...(folder.updatedAt ? { updatedAt: folder.updatedAt } : {}),
  };
}

function factsFromFile(file: SpaceDriveFile): FileSpaceNodeFacts {
  const decoded = decodeConnectorNodeId(file.id);
  return {
    connectionId: decoded?.connectionId ?? null,
    originalRef: decoded?.ref || null,
    readOnly: Boolean(file.readOnly),
    ...(file.createdAt ? { createdAt: file.createdAt } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(typeof file.sizeBytes === "number"
      ? { sizeBytes: file.sizeBytes }
      : {}),
    ...(file.updatedAt ? { updatedAt: file.updatedAt } : {}),
  };
}

/**
 * What the Data-tree row already knows — enough to fill Get Info without a
 * second listing walk (connection on mounts, MIME/size on files, provider
 * path when the id is a `cnx:` key).
 */
export function fileSpaceFactsFromNode(node: DriveNode): FileSpaceNodeFacts {
  const decoded = decodeConnectorNodeId(node.sourceId);
  return {
    connectionId: node.connectionId ?? decoded?.connectionId ?? null,
    originalRef: decoded?.ref || null,
    readOnly: false,
    ...(node.mimeType ? { mimeType: node.mimeType } : {}),
    ...(typeof node.sizeBytes === "number"
      ? { sizeBytes: node.sizeBytes }
      : {}),
    ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
  };
}

export function mergeFileSpaceFacts(
  base: FileSpaceNodeFacts,
  extra: FileSpaceNodeFacts | null
): FileSpaceNodeFacts {
  if (!extra) {
    return base;
  }
  return {
    connectionId: extra.connectionId ?? base.connectionId,
    originalRef: extra.originalRef ?? base.originalRef,
    readOnly: extra.readOnly || base.readOnly,
    ...(extra.createdAt || base.createdAt
      ? { createdAt: extra.createdAt ?? base.createdAt }
      : {}),
    ...(extra.mimeType || base.mimeType
      ? { mimeType: extra.mimeType ?? base.mimeType }
      : {}),
    ...(typeof extra.sizeBytes === "number" ||
    typeof base.sizeBytes === "number"
      ? { sizeBytes: extra.sizeBytes ?? base.sizeBytes }
      : {}),
    ...(extra.source || base.source
      ? { source: extra.source ?? base.source }
      : {}),
    ...(extra.updatedAt || base.updatedAt
      ? { updatedAt: extra.updatedAt ?? base.updatedAt }
      : {}),
  };
}

export async function resolveFileSpaceNodeFacts(input: {
  dataPath: string;
  isFile: boolean;
  owner: FileSpaceOwnerRef;
  sourceId: string;
  signal?: AbortSignal;
}): Promise<FileSpaceNodeFacts | null> {
  const segments = filesRelativeSegments(input.dataPath);
  const folderNames = input.isFile ? segments.slice(0, -1) : segments;
  let listing = await getFileSpaceListing(input.owner, null, input.signal);
  let folder: SpaceDriveFolder | null = null;

  for (const name of folderNames) {
    const match = listing.folders.find(
      (row) => row.name.toLowerCase() === name.toLowerCase()
    );
    if (!match) {
      return null;
    }
    folder = match;
    listing = await getFileSpaceListing(input.owner, match.id, input.signal);
  }

  if (input.isFile) {
    const file = listing.files.find((row) => row.id === input.sourceId);
    return file ? factsFromFile(file) : null;
  }
  return folder ? factsFromFolder(folder) : null;
}

export function useFileSpaceNodeFacts(
  node: DriveNode,
  spaceId: string | null,
  enabled: boolean
) {
  const owner = spaceId ? spaceDriveRootOwner(spaceId) : null;
  const isFile = isFilesTreeFile(node);
  const path = node.dataPath;
  const seed = fileSpaceFactsFromNode(node);
  const queryEnabled = Boolean(
    enabled && owner && path && isFilesTreeNode(node)
  );

  return useQuery({
    enabled: queryEnabled,
    placeholderData: seed,
    queryFn: async ({ signal }) =>
      mergeFileSpaceFacts(
        seed,
        await resolveFileSpaceNodeFacts({
          dataPath: path ?? "",
          isFile,
          owner: owner ?? { id: "", type: "space" },
          sourceId: node.sourceId,
          signal,
        })
      ),
    queryKey: [
      ...spaceDriveKeys.file(owner ?? { id: "", type: "space" }, node.sourceId),
      "facts",
      path ?? "",
    ],
    staleTime: 15_000,
  });
}
