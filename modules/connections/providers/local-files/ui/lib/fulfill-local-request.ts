import { toast } from "sonner";
import { LOCAL_FILES_ERROR } from "../../src/protocol.js";
import type { ClaimedRequest } from "../api.js";
import {
  deletePath as deleteDesktopPath,
  getDesktopDirectoryPath,
  isDesktopShell,
  listDirectory as listDesktopDirectory,
  readFile as readDesktopFile,
  searchFiles as searchDesktopFiles,
  statPath as statDesktopPath,
  writeFile as writeDesktopFile,
} from "./desktop-fs.js";
import {
  deletePath,
  hasReadPermission,
  listDirectory,
  queryWritePermission,
  readFile,
  requestWritePermission,
  searchFiles,
  statPath,
  writeFile,
} from "./fsa.js";
import { getHandle } from "./handle-store.js";

type FulfillResult =
  | { ok: true; response: unknown }
  | { errorCode: string; errorText: string; ok: false };

function promptForFolderWriteAccess(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (granted: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(granted);
    };
    toast.warning(
      "This folder was granted read-only. Allow writes to save, then retry if the save timed out.",
      {
        action: {
          label: "Allow writes",
          onClick: () => {
            void requestWritePermission(handle).then(finish);
          },
        },
        duration: 15_000,
        onAutoClose: () => finish(false),
        onDismiss: () => finish(false),
      }
    );
  });
}

async function ensureFolderWritable(
  handle: FileSystemDirectoryHandle
): Promise<FulfillResult | null> {
  if (await queryWritePermission(handle)) {
    return null;
  }
  if (await promptForFolderWriteAccess(handle)) {
    return null;
  }
  return {
    errorCode: LOCAL_FILES_ERROR.permissionLost,
    errorText:
      "browser access to this folder is read-only — reconnect it to allow writes",
    ok: false,
  };
}

/** Desktop shell: serve requests from the natively granted folder path. */
async function fulfillDesktop(request: ClaimedRequest): Promise<FulfillResult> {
  const root = getDesktopDirectoryPath(request.connection_id);
  if (!root) {
    return {
      errorCode: LOCAL_FILES_ERROR.notFound,
      errorText: "this desktop app no longer holds the folder path",
      ok: false,
    };
  }
  const input = request.input as {
    content_base64?: string;
    content_text?: string;
    limit?: number;
    max_bytes?: number;
    path: string;
    query?: string;
  };
  switch (request.action) {
    case "list":
      return { ok: true, response: await listDesktopDirectory(root, input) };
    case "read":
      return { ok: true, response: await readDesktopFile(root, input) };
    case "stat":
      return { ok: true, response: await statDesktopPath(root, input) };
    case "search":
      return {
        ok: true,
        response: await searchDesktopFiles(root, {
          limit: input.limit,
          path: input.path,
          query: input.query ?? "",
        }),
      };
    case "write":
      return { ok: true, response: await writeDesktopFile(root, input) };
    case "delete":
      return { ok: true, response: await deleteDesktopPath(root, input) };
    default:
      return {
        errorCode: LOCAL_FILES_ERROR.notFound,
        errorText: `unknown action ${request.action}`,
        ok: false,
      };
  }
}

export async function fulfillLocalRequest(
  request: ClaimedRequest
): Promise<FulfillResult> {
  if (isDesktopShell()) {
    return fulfillDesktop(request);
  }
  const handle = await getHandle(request.connection_id);
  if (!handle) {
    return {
      errorCode: LOCAL_FILES_ERROR.notFound,
      errorText: "this browser no longer holds the folder handle",
      ok: false,
    };
  }
  if (!(await hasReadPermission(handle))) {
    return {
      errorCode: LOCAL_FILES_ERROR.permissionLost,
      errorText: "browser access to this folder was revoked",
      ok: false,
    };
  }
  const input = request.input as {
    content_base64?: string;
    content_text?: string;
    limit?: number;
    max_bytes?: number;
    path: string;
    query?: string;
  };
  switch (request.action) {
    case "list":
      return { ok: true, response: await listDirectory(handle, input) };
    case "read":
      return { ok: true, response: await readFile(handle, input) };
    case "stat":
      return { ok: true, response: await statPath(handle, input) };
    case "search":
      return {
        ok: true,
        response: await searchFiles(handle, {
          limit: input.limit,
          path: input.path,
          query: input.query ?? "",
        }),
      };
    case "write": {
      const blocked = await ensureFolderWritable(handle);
      if (blocked) {
        return blocked;
      }
      return { ok: true, response: await writeFile(handle, input) };
    }
    case "delete": {
      const blocked = await ensureFolderWritable(handle);
      if (blocked) {
        return blocked;
      }
      return { ok: true, response: await deletePath(handle, input) };
    }
    default:
      return {
        errorCode: LOCAL_FILES_ERROR.notFound,
        errorText: `unknown action ${request.action}`,
        ok: false,
      };
  }
}
