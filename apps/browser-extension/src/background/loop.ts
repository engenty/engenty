import { CLAIM_WAIT_MS } from "@engenty/browser-bridge/protocol";
import {
  BridgeApiError,
  type ClaimedRequest,
  claimRequests,
  postHeartbeat,
  respondRequest,
} from "./api.js";
import { executeCommand } from "./commands.js";
import { getState, patchState, upsertActivity } from "./state.js";
import { describeWindowState } from "./window.js";

/**
 * The claim loop: hold POST /claim for up to CLAIM_WAIT_MS, execute claimed
 * commands sequentially (one in-flight command per installation), respond,
 * re-issue immediately. The held fetch keeps the MV3 service worker alive
 * while linked; a `chrome.alarms` watchdog restarts the loop after the worker
 * is killed.
 */

let loopRunning = false;
let consecutiveAuthFailures = 0;
let backoffMs = 1000;

const MAX_BACKOFF_MS = 30_000;
const AUTH_FAILURE_LIMIT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeCommand(request: ClaimedRequest): string {
  const input = request.input ?? {};
  if (request.action === "navigate" && typeof input.url === "string") {
    return input.url;
  }
  if (
    (request.action === "click" || request.action === "fill") &&
    typeof input.ref === "number"
  ) {
    return `ref=${input.ref}`;
  }
  return "";
}

async function handleRequest(request: ClaimedRequest): Promise<void> {
  const startedAt = Date.now();
  await upsertActivity({
    action: request.action,
    detail: describeCommand(request),
    id: request.id,
    status: "running",
    ts: startedAt,
  });
  const outcome = await executeCommand(request);
  try {
    await respondRequest({
      error: outcome.error ?? null,
      errorCode: outcome.errorCode ?? null,
      ok: outcome.ok,
      requestId: request.id,
      response: outcome.response ?? null,
    });
  } catch {
    // The awaiting server times the request out; nothing else to do here.
  }
  await upsertActivity({
    action: request.action,
    detail: describeCommand(request),
    durationMs: Date.now() - startedAt,
    error: outcome.error,
    id: request.id,
    status: outcome.ok ? "ok" : "error",
    ts: startedAt,
  });
}

async function iteration(): Promise<"continue" | "stop"> {
  const state = await getState();
  if (!state.linked || state.paused || state.relink) {
    return "stop";
  }
  try {
    const { requests } = await claimRequests({ waitMs: CLAIM_WAIT_MS });
    consecutiveAuthFailures = 0;
    backoffMs = 1000;
    for (const request of requests) {
      await handleRequest(request);
    }
    return "continue";
  } catch (error) {
    if (error instanceof BridgeApiError && error.status === 401) {
      consecutiveAuthFailures += 1;
      if (consecutiveAuthFailures >= AUTH_FAILURE_LIMIT) {
        // Token expired and no refresh channel in v1 — surface re-link.
        await patchState({ relink: true });
        return "stop";
      }
    }
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    return "continue";
  }
}

export function startClaimLoop(): void {
  if (loopRunning) {
    return;
  }
  loopRunning = true;
  void (async () => {
    try {
      for (;;) {
        const verdict = await iteration();
        if (verdict === "stop") {
          return;
        }
      }
    } finally {
      loopRunning = false;
    }
  })();
}

export function isLoopRunning(): boolean {
  return loopRunning;
}

export async function sendHeartbeat(): Promise<void> {
  const state = await getState();
  if (!state.linked || state.relink) {
    return;
  }
  try {
    await postHeartbeat(await describeWindowState());
  } catch (error) {
    if (error instanceof BridgeApiError && error.status === 401) {
      consecutiveAuthFailures += 1;
      if (consecutiveAuthFailures >= AUTH_FAILURE_LIMIT) {
        await patchState({ relink: true });
      }
    }
  }
}
