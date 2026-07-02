import {
  createNativeFileSource,
  type NativeBlobStore,
} from "@engenty/file-storage";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerFileManagerRoutes } from "./api/file-manager-routes.js";
import { createFileManagerStores } from "./dal/file-manager-store.js";

/** Bucket the file manager stores native blobs in. */
const FILE_MANAGER_BUCKET = "files";

const registerFilesPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;

  // Core file storage/preview routes are wired directly in
  // apps/core/src/api/routes/file-storage-routes.ts. Here we add the DB-backed
  // file manager (folders + entries) that powers per-owner file spaces such as
  // the projects "Files" tab.
  const adapter = server.getDatabaseAdapter?.() ?? null;
  const storage = server.getStorageService?.(FILE_MANAGER_BUCKET) ?? null;
  if (!(adapter && storage)) {
    // CLI/boot contexts without a database adapter: file manager is unavailable.
    return;
  }

  const { folders, entries } = createFileManagerStores(adapter);
  const blobs: NativeBlobStore = {
    delete: (key) => storage.delete?.(key) ?? Promise.resolve(),
    getUrl: (key, options) => storage.getUrl(key, options),
    exists: storage.exists ? (key) => storage.exists!(key) : undefined,
  };
  const source = createNativeFileSource({ folders, entries, blobs });

  registerFileManagerRoutes(server, source);
};

export default registerFilesPlugin;
