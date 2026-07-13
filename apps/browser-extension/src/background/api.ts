import { getState } from "./state.js";

/** Claimed command as delivered by the claim route. */
export interface ClaimedRequest {
  action: string;
  connection_id: string;
  id: string;
  input: Record<string, unknown>;
}

export class BridgeApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BridgeApiError";
    this.status = status;
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number
): Promise<T> {
  const state = await getState();
  const base = state.apiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${state.token}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new BridgeApiError(
      response.status,
      `${path} failed with ${response.status}`
    );
  }
  const parsed = (await response.json().catch(() => null)) as unknown;
  // Core wraps route results in a `{ success, data }` envelope.
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as { success?: boolean }).success === true &&
    "data" in parsed
  ) {
    return (parsed as { data: T }).data;
  }
  return parsed as T;
}

export function claimRequests(input: {
  waitMs: number;
}): Promise<{ requests: ClaimedRequest[] }> {
  return getState().then((state) =>
    postJson(
      "/api/browser-bridge/claim",
      { installation_id: state.installationId, wait_ms: input.waitMs },
      // The server holds up to waitMs; leave headroom for transport.
      input.waitMs + 5000
    )
  );
}

export function respondRequest(input: {
  error?: string | null;
  errorCode?: string | null;
  ok: boolean;
  requestId: string;
  response?: unknown;
}): Promise<{ ok: boolean }> {
  return getState().then((state) =>
    postJson(
      "/api/browser-bridge/respond",
      {
        error: input.error ?? null,
        error_code: input.errorCode ?? null,
        installation_id: state.installationId,
        ok: input.ok,
        request_id: input.requestId,
        response: input.response ?? null,
      },
      15_000
    )
  );
}

export function postHeartbeat(windowState: unknown): Promise<{ ok: boolean }> {
  return getState().then((state) =>
    postJson(
      "/api/browser-bridge/heartbeat",
      { installation_id: state.installationId, window_state: windowState },
      15_000
    )
  );
}

export function postDisconnect(): Promise<{ ok: boolean }> {
  return getState().then((state) =>
    postJson(
      "/api/browser-bridge/disconnect",
      { installation_id: state.installationId },
      15_000
    )
  );
}
