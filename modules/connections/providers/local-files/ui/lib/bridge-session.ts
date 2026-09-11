/**
 * One claim/heartbeat loop for the tab, ref-counted by the Files UI.
 *
 * The loop only runs while a files surface is mounted AND this browser holds a
 * granted folder. Chat/Work/etc. do not poll.
 */
import { toast } from "sonner";
import {
  CLAIM_POLL_MS,
  HEARTBEAT_MS,
  LOCAL_FILES_ERROR,
} from "../../src/protocol.js";
import { claimRequests, postHeartbeat, respondRequest } from "../api.js";
import { isDesktopShell } from "./desktop-fs.js";
import { isSupported } from "./fsa.js";
import { fulfillLocalRequest } from "./fulfill-local-request.js";
import { deviceLabel, installationId } from "./installation.js";
import { hasServableLocalFolder } from "./servable-folders.js";

export const LOCAL_FOLDER_GRANTED_EVENT = "engenty:local-files-granted";

export function notifyLocalFolderGranted(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(LOCAL_FOLDER_GRANTED_EVENT));
}

type ReadyListener = (ready: boolean) => void;

let subscribers = 0;
let stopSession: (() => void) | null = null;
let ready = true;
const readyListeners = new Set<ReadyListener>();

function setReady(value: boolean): void {
  ready = value;
  for (const listener of readyListeners) {
    listener(value);
  }
}

export function subscribeLocalFilesBridgeReady(
  listener: ReadyListener
): () => void {
  readyListeners.add(listener);
  listener(ready);
  return () => {
    readyListeners.delete(listener);
  };
}

/**
 * Keep the claim/heartbeat loop alive for as long as a files surface is
 * showing. Nested FileManager + tree expansions share one loop.
 */
export function acquireLocalFilesBridge(): () => void {
  subscribers += 1;
  if (subscribers === 1) {
    setReady(false);
    stopSession = startSession();
  }
  return () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) {
      stopSession?.();
      stopSession = null;
      setReady(true);
    }
  };
}

function startSession(): () => void {
  if (!(isSupported() || isDesktopShell())) {
    setReady(true);
    return () => undefined;
  }

  const id = installationId();
  const label = deviceLabel();
  let stopped = false;
  let draining = false;
  let permissionToasted = false;
  let claimTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stopTimers = () => {
    if (claimTimer) {
      clearInterval(claimTimer);
      claimTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const heartbeat = () =>
    postHeartbeat({ deviceLabel: label, installationId: id }).catch(
      () => undefined
    );

  const drain = async () => {
    if (draining || stopped) {
      return;
    }
    draining = true;
    try {
      const { requests } = await claimRequests(id);
      for (const request of requests) {
        const result = await fulfillLocalRequest(request).catch((error) => ({
          errorCode: LOCAL_FILES_ERROR.notFound,
          errorText: error instanceof Error ? error.message : String(error),
          ok: false as const,
        }));
        if (
          !result.ok &&
          result.errorCode === LOCAL_FILES_ERROR.permissionLost &&
          !permissionToasted
        ) {
          permissionToasted = true;
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
      draining = false;
    }
  };

  const boot = async () => {
    stopTimers();
    if (stopped) {
      return;
    }
    if (!(await hasServableLocalFolder())) {
      setReady(true);
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      setReady(true);
      return;
    }
    setReady(false);
    await heartbeat();
    if (stopped) {
      return;
    }
    setReady(true);
    void drain();
    claimTimer = setInterval(() => {
      if (!stopped) {
        void drain();
      }
    }, CLAIM_POLL_MS);
    heartbeatTimer = setInterval(() => {
      if (!stopped) {
        void heartbeat();
      }
    }, HEARTBEAT_MS);
  };

  const onGranted = () => {
    void boot();
  };
  const onVisibility = () => {
    void boot();
  };

  window.addEventListener(LOCAL_FOLDER_GRANTED_EVENT, onGranted);
  document.addEventListener("visibilitychange", onVisibility);
  void boot();

  return () => {
    stopped = true;
    stopTimers();
    window.removeEventListener(LOCAL_FOLDER_GRANTED_EVENT, onGranted);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
