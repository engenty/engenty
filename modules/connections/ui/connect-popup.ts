// Contract between the popup connect flow (ConnectButton `flow="popup"`) and
// the /connections/oauth/complete landing page the OAuth callback returns to.
// The landing page posts a ConnectCompleteMessage to `window.opener` and on a
// same-origin BroadcastChannel (a provider's Cross-Origin-Opener-Policy can
// sever `window.opener`), then closes itself; the opener resolves the flow
// from whichever arrives first.

export const CONNECT_COMPLETE_PATH = "/connections/oauth/complete";

export const CONNECT_COMPLETE_MESSAGE_TYPE =
  "engenty:connections:oauth-complete";

export const CONNECT_COMPLETE_CHANNEL = "engenty:connections:oauth";

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

/**
 * Runs before the app boots: on the landing page (only the popup flow returns
 * there), report the result and close the popup. The app shell never loads in
 * it. A provider's opener policy can leave the popup unclosable by script;
 * then it says so in one line instead. Returns true on the landing page — the
 * caller renders nothing else.
 */
export function reportConnectPopupResult(): boolean {
  if (window.location.pathname !== CONNECT_COMPLETE_PATH) {
    return false;
  }
  const message: ConnectCompleteMessage = {
    ...parseConnectCompleteSearch(window.location.search),
    type: CONNECT_COMPLETE_MESSAGE_TYPE,
  };
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CONNECT_COMPLETE_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
  (window.opener as Window | null)?.postMessage(
    message,
    window.location.origin
  );
  window.close();
  const german = navigator.language.toLowerCase().startsWith("de");
  const line = message.ok
    ? german
      ? "Verbunden. Du kannst dieses Fenster schließen."
      : "Connected. You can close this window."
    : german
      ? `Verbinden fehlgeschlagen (${message.error ?? "unbekannt"}). Du kannst dieses Fenster schließen.`
      : `Connecting failed (${message.error ?? "unknown"}). You can close this window.`;
  document.body.style.cssText =
    "margin:0;display:grid;place-items:center;min-height:100vh;font:14px system-ui,sans-serif;color:#555";
  document.body.textContent = line;
  return true;
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
