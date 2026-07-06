import {
  type FileSource,
  type FileSourceContext,
  FileSourceReadOnlyError,
} from "@engenty/file-storage";
import type { ConnectorMountRow } from "./connector-file-source.js";
import { isConnectorNodeId } from "./connector-ref.js";

export interface CreateCompositeFileSourceOptions {
  connector: FileSource;
  getMount(
    ctx: FileSourceContext,
    folderId: string
  ): Promise<ConnectorMountRow | null>;
  native: FileSource;
}

/**
 * Routes file-space operations between the native source and the connector
 * source by node identity:
 * - virtual `cnx:` ids → connector (browse/download only)
 * - a mount-root uuid → connector for listing (descends into the provider),
 *   native for rename/move/delete (managing the mount row = unmount)
 * - anything else → native, with guards that block creating/moving/uploading
 *   INTO a mount (mounts are read-only projections of external content)
 */
export function createCompositeFileSource(
  options: CreateCompositeFileSourceOptions
): FileSource {
  const { connector, getMount, native } = options;

  async function isMountRoot(
    ctx: FileSourceContext,
    folderId: string | null | undefined
  ): Promise<boolean> {
    if (!folderId || isConnectorNodeId(folderId)) {
      return false;
    }
    return (await getMount(ctx, folderId)) !== null;
  }

  async function assertWritableContainer(
    ctx: FileSourceContext,
    folderId: string | null | undefined
  ): Promise<void> {
    if (folderId && isConnectorNodeId(folderId)) {
      throw new FileSourceReadOnlyError();
    }
    if (await isMountRoot(ctx, folderId)) {
      throw new FileSourceReadOnlyError();
    }
  }

  return {
    kind: "native",

    async listFolder(ctx, folderId, listOptions) {
      if (folderId && isConnectorNodeId(folderId)) {
        return connector.listFolder(ctx, folderId, listOptions);
      }
      if (folderId && (await getMount(ctx, folderId))) {
        return connector.listFolder(ctx, folderId, listOptions);
      }
      return native.listFolder(ctx, folderId, listOptions);
    },

    async getDownloadUrl(ctx, fileId) {
      return isConnectorNodeId(fileId)
        ? connector.getDownloadUrl(ctx, fileId)
        : native.getDownloadUrl(ctx, fileId);
    },

    async createFolder(ctx, parentId, name) {
      await assertWritableContainer(ctx, parentId);
      return native.createFolder(ctx, parentId, name);
    },

    async beginUpload(ctx, input) {
      await assertWritableContainer(ctx, input.folderId);
      return native.beginUpload(ctx, input);
    },

    finalizeUpload: (ctx, entryId) => native.finalizeUpload(ctx, entryId),

    async renameFolder(ctx, folderId, name) {
      if (isConnectorNodeId(folderId)) {
        throw new FileSourceReadOnlyError();
      }
      // Renaming a mount row itself is allowed — it renames the mount label.
      return native.renameFolder(ctx, folderId, name);
    },

    async moveFolder(ctx, folderId, newParentId) {
      if (isConnectorNodeId(folderId)) {
        throw new FileSourceReadOnlyError();
      }
      await assertWritableContainer(ctx, newParentId);
      return native.moveFolder(ctx, folderId, newParentId);
    },

    async deleteFolder(ctx, folderId) {
      if (isConnectorNodeId(folderId)) {
        throw new FileSourceReadOnlyError();
      }
      // Deleting a mount row is "remove source": provider content untouched.
      return native.deleteFolder(ctx, folderId);
    },

    async renameFile(ctx, fileId, name) {
      if (isConnectorNodeId(fileId)) {
        throw new FileSourceReadOnlyError();
      }
      return native.renameFile(ctx, fileId, name);
    },

    async moveFile(ctx, fileId, newFolderId) {
      if (isConnectorNodeId(fileId)) {
        throw new FileSourceReadOnlyError();
      }
      await assertWritableContainer(ctx, newFolderId);
      return native.moveFile(ctx, fileId, newFolderId);
    },

    async deleteFile(ctx, fileId) {
      if (isConnectorNodeId(fileId)) {
        throw new FileSourceReadOnlyError();
      }
      return native.deleteFile(ctx, fileId);
    },
  };
}
