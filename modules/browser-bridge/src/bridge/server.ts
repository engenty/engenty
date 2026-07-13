import type { ConnectionSummary } from "@engenty/connections-sdk";
import {
  ACTION_TIMEOUT_MS,
  BROWSER_BRIDGE_ERROR,
  type BridgeAction,
  LIVENESS_WINDOW_MS,
  RESPONSE_POLL_MS,
} from "../protocol.js";
import type { BrowserBridgeRepo } from "../repo.js";

function bridgeError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Round-trip a browser action into the linked extension:
 *  1. resolve the connection → its extension installation
 *  2. fail fast if that installation has no recent heartbeat (browser closed
 *     or the extension is paused)
 *  3. enqueue a durable request row and wait for the extension to fulfill it
 *
 * The extension claims the row over its held long-poll, executes it in the
 * managed window, and posts the response back through the authenticated
 * respond route.
 */
export async function runBridgeAction(params: {
  action: BridgeAction;
  connection: ConnectionSummary;
  input: unknown;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  /** Test override for the poll cadence. */
  pollIntervalMs?: number;
  repo: BrowserBridgeRepo;
  /** Test override for the wait ceiling. */
  timeoutMs?: number;
}): Promise<unknown> {
  const { connection, repo } = params;
  const pollIntervalMs = params.pollIntervalMs ?? RESPONSE_POLL_MS;
  const timeoutMs = params.timeoutMs ?? ACTION_TIMEOUT_MS[params.action];

  const installation = await repo.getInstallationByConnection(connection.id);
  if (!installation) {
    throw bridgeError(
      BROWSER_BRIDGE_ERROR.browserOffline,
      `no linked browser extension for connection ${connection.id}`
    );
  }
  const lastSeen = new Date(installation.last_seen_at).getTime();
  if (Date.now() - lastSeen > LIVENESS_WINDOW_MS) {
    throw bridgeError(
      BROWSER_BRIDGE_ERROR.browserOffline,
      `the linked browser ("${installation.device_label}") is offline — open the linked browser window (or unpause the extension) and retry`
    );
  }

  const request = await repo.insertRequest({
    action: params.action,
    connectionId: connection.id,
    expiresAt: new Date(Date.now() + timeoutMs + 10_000),
    input: params.input,
    installationId: installation.installation_id,
    tenantId: connection.tenant_id,
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const row = await repo.getRequest(request.id);
    if (!row || row.status === "pending" || row.status === "claimed") {
      continue;
    }
    if (row.status === "completed") {
      return row.response;
    }
    // error / expired
    throw bridgeError(
      row.error_code ?? BROWSER_BRIDGE_ERROR.timeout,
      row.error ?? "browser action failed"
    );
  }

  await repo.expireRequest(request.id);
  params.log?.("browser-bridge action timed out", { request_id: request.id });
  throw bridgeError(
    BROWSER_BRIDGE_ERROR.timeout,
    "the browser did not respond in time; is the linked window still open?"
  );
}
