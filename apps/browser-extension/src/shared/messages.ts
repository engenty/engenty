/**
 * Message contracts shared between the web app, the service worker, and the
 * side panel.
 *
 * Link handshake (kept deliberately simple in v1):
 * 1. The engenty settings page (`/settings/browser-bridge`) calls
 *    `POST /api/browser-bridge/link` itself — it holds the Supabase session —
 *    and then sends the result plus the current access token to the extension
 *    via `chrome.runtime.sendMessage(EXTENSION_ID, message)`. The extension id
 *    is pasted into a text input on that page (env-configured later).
 * 2. The extension stores the payload as a PENDING link (nothing is trusted
 *    yet), opens its side panel, and shows a confirm card with the sender
 *    origin.
 * 3. Only on explicit user confirmation does the payload become the active
 *    credential set and the claim loop starts. Rejecting discards it.
 *
 * Token model (v1): the Supabase access token expires; on repeated 401 the
 * panel shows a "re-link" state and the user re-runs the handshake. Scoped
 * long-lived device tokens are a noted follow-up.
 */

export const LINK_MESSAGE_KIND = "engenty-bridge-link";

export interface BridgeLinkMessage {
  allowed_origins: string[];
  api_base_url: string;
  connection_id: string;
  device_label: string;
  installation_id: string;
  kind: typeof LINK_MESSAGE_KIND;
  session_id: string;
  token: string;
}

export function isBridgeLinkMessage(
  value: unknown
): value is BridgeLinkMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message.kind === LINK_MESSAGE_KIND &&
    typeof message.api_base_url === "string" &&
    typeof message.installation_id === "string" &&
    typeof message.connection_id === "string" &&
    typeof message.session_id === "string" &&
    typeof message.token === "string" &&
    typeof message.device_label === "string" &&
    Array.isArray(message.allowed_origins)
  );
}

/** Panel → service worker control messages. */
export type PanelCommand =
  | { kind: "panel-confirm-link" }
  | { kind: "panel-reject-link" }
  | { kind: "panel-set-paused"; paused: boolean }
  | { kind: "panel-reopen-window" }
  | { kind: "panel-unlink" }
  | { kind: "panel-grant-site-access" };
