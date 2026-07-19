import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  CLAIM_POLL_MS,
  HEARTBEAT_MS,
  LOCAL_FILES_ERROR,
} from "../../src/protocol.js";
import {
  type ClaimedRequest,
  claimRequests,
  postHeartbeat,
  respondRequest,
} from "../api.js";
import {
  getDesktopDirectoryPath,
  isDesktopShell,
  listDirectory as listDesktopDirectory,
  readFile as readDesktopFile,
  searchFiles as searchDesktopFiles,
  statPath as statDesktopPath,
} from "../lib/desktop-fs.js";
import {
  hasReadPermission,
  isSupported,
  listDirectory,
  readFile,
  searchFiles,
  statPath,
} from "../lib/fsa.js";
import { getHandle } from "../lib/handle-store.js";
import { deviceLabel, installationId } from "../lib/installation.js";

type FulfillResult =
  | { ok: true; response: unknown }
  | { errorCode: string; errorText: string; ok: false };

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
    default:
      return {
        errorCode: LOCAL_FILES_ERROR.notFound,
        errorText: `unknown action ${request.action}`,
        ok: false,
      };
  }
}

async function fulfill(request: ClaimedRequest): Promise<FulfillResult> {
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
    default:
      return {
        errorCode: LOCAL_FILES_ERROR.notFound,
        errorText: `unknown action ${request.action}`,
        ok: false,
      };
  }
}

/**
 * Always-mounted bridge: while an Engenty tab is open, it heartbeats this
 * browser installation's liveness and drains pending local-file requests,
 * fulfilling each against the granted directory handle. Registered as a
 * `backgroundComponent`, so it stays mounted across navigation.
 */
export function LocalFilesBridge() {
  const draining = useRef(false);
  const permissionToasted = useRef(false);

  useEffect(() => {
    if (!(isSupported() || isDesktopShell())) {
      return;
    }
    const id = installationId();
    const label = deviceLabel();
    let stopped = false;

    const drain = async () => {
      if (draining.current) {
        return;
      }
      draining.current = true;
      try {
        const { requests } = await claimRequests(id);
        for (const request of requests) {
          const result = await fulfill(request).catch((error) => ({
            errorCode: LOCAL_FILES_ERROR.notFound,
            errorText: error instanceof Error ? error.message : String(error),
            ok: false as const,
          }));
          if (
            !result.ok &&
            result.errorCode === LOCAL_FILES_ERROR.permissionLost &&
            !permissionToasted.current
          ) {
            permissionToasted.current = true;
            toast.warning(
              "A connected local folder lost access — re-grant it in Connections settings."
            );
          }
          await respondRequest({
            error: result.ok ? null : result.errorText,
            errorCode: result.ok ? null : result.errorCode,
            installationId: id,
            ok: result.ok,
            requestId: request.id,
            response: result.ok ? result.response : null,
          });
        }
      } catch {
        // Transient network/auth errors: the next tick retries.
      } finally {
        draining.current = false;
      }
    };

    const heartbeat = () => {
      void postHeartbeat({ deviceLabel: label, installationId: id }).catch(
        () => undefined
      );
    };

    heartbeat();
    void drain();
    const claimTimer = setInterval(() => {
      if (!stopped) {
        void drain();
      }
    }, CLAIM_POLL_MS);
    const heartbeatTimer = setInterval(() => {
      if (!stopped) {
        heartbeat();
      }
    }, HEARTBEAT_MS);

    return () => {
      stopped = true;
      clearInterval(claimTimer);
      clearInterval(heartbeatTimer);
    };
  }, []);

  return null;
}
