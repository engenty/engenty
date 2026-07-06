import type { ConnectionSummary } from "@engenty/connections-sdk";
import {
  LIVENESS_WINDOW_MS,
  LOCAL_FILES_ERROR,
  REQUEST_TIMEOUT_MS,
  type BridgeAction,
} from "../protocol.js";
import type { LocalFilesRepo } from "../repo.js";

const POLL_INTERVAL_MS = 400;

function bridgeError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Round-trip a file action into the browser tab that holds the granted
 * directory handle:
 *  1. resolve the connection → its browser installation
 *  2. fail fast if that installation has no recent heartbeat (browser closed)
 *  3. enqueue a durable request row and wait for the bridge to fulfill it
 *
 * The browser side claims the row (short-poll), executes it via the File
 * System Access API, and posts the response back through the authenticated
 * respond route.
 */
export async function runBridgeAction(params: {
  action: BridgeAction;
  connection: ConnectionSummary;
  input: unknown;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  /** Test override for the poll cadence. */
  pollIntervalMs?: number;
  repo: LocalFilesRepo;
  /** Test override for the wait ceiling. */
  timeoutMs?: number;
}): Promise<unknown> {
  const { connection, repo } = params;
  const pollIntervalMs = params.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = params.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const directory = await repo.getDirectoryByConnection(connection.id);
  if (!directory) {
    throw bridgeError(
      LOCAL_FILES_ERROR.notFound,
      `no granted directory for connection ${connection.id}`
    );
  }

  const installation = await repo.getInstallation(directory.installation_id);
  const lastSeen = installation
    ? new Date(installation.last_seen_at).getTime()
    : 0;
  if (!installation || Date.now() - lastSeen > LIVENESS_WINDOW_MS) {
    throw bridgeError(
      LOCAL_FILES_ERROR.browserOffline,
      `open Engenty in the browser where "${
        connection.external_account ?? directory.directory_name
      }" was granted`
    );
  }

  const request = await repo.insertRequest({
    action: params.action,
    connectionId: connection.id,
    expiresAt: new Date(Date.now() + timeoutMs + 10_000),
    input: params.input,
    installationId: directory.installation_id,
    tenantId: connection.tenant_id,
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const row = await repo.getRequest(request.id);
    if (!row || row.status === "pending") {
      continue;
    }
    if (row.status === "completed") {
      return row.response;
    }
    // error / expired
    throw bridgeError(
      row.error_code ?? LOCAL_FILES_ERROR.notFound,
      row.error ?? "local file action failed"
    );
  }

  await repo.expireRequest(request.id);
  params.log?.("local-files bridge timed out", { request_id: request.id });
  throw bridgeError(
    LOCAL_FILES_ERROR.timeout,
    "the browser did not respond in time; is the tab still open?"
  );
}
