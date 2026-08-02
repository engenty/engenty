// Contract between the popup connect flow (ConnectButton `flow="popup"`) and
// the /connections/oauth/complete landing page the OAuth callback returns to.
// The landing page posts a ConnectCompleteMessage to `window.opener` (same
// origin) and closes itself; the opener resolves the flow from that message.

export const CONNECT_COMPLETE_PATH = "/connections/oauth/complete";

export const CONNECT_COMPLETE_MESSAGE_TYPE =
  "engenty:connections:oauth-complete";

export interface ConnectCompleteResult {
  connectorId: string | null;
  error: string | null;
  ok: boolean;
}

export interface ConnectCompleteMessage extends ConnectCompleteResult {
  type: typeof CONNECT_COMPLETE_MESSAGE_TYPE;
}

/** Reads the `?connected=1&connector=…` / `?error=…` callback query params. */
export function parseConnectCompleteSearch(
  search: string
): ConnectCompleteResult {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  return {
    connectorId: params.get("connector"),
    error,
    ok: params.get("connected") === "1" && !error,
  };
}

/** Validates a window `message` event from the popup; null when unrelated. */
export function readConnectCompleteMessage(event: {
  data: unknown;
  origin: string;
}): ConnectCompleteMessage | null {
  if (event.origin !== window.location.origin) {
    return null;
  }
  const data = event.data as Partial<ConnectCompleteMessage> | null;
  if (
    !data ||
    typeof data !== "object" ||
    data.type !== CONNECT_COMPLETE_MESSAGE_TYPE ||
    typeof data.ok !== "boolean"
  ) {
    return null;
  }
  return {
    connectorId: typeof data.connectorId === "string" ? data.connectorId : null,
    error: typeof data.error === "string" ? data.error : null,
    ok: data.ok,
    type: CONNECT_COMPLETE_MESSAGE_TYPE,
  };
}
