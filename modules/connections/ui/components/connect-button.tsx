import { useTranslation } from "@engenty/i18n/ui";
import { MY_CONNECTIONS_PATH } from "@engenty/plugin-sdk";
import { Button } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getConnectUrl } from "../api.js";
import {
  CONNECT_COMPLETE_CHANNEL,
  CONNECT_COMPLETE_PATH,
  type ConnectCompleteResult,
  readConnectCompleteMessage,
} from "../connect-popup.js";

export interface ConnectButtonProps {
  className?: string;
  connectorId: string;
  /** `popup` keeps the current page (chat) and resolves via `onResult`. */
  flow?: "redirect" | "popup";
  /** Connections already exist — label the button "Add account" instead. */
  hasConnections?: boolean;
  /** Overrides Connect / Add account (marketplace uses Authenticate). */
  label?: string;
  /** Node rendered before the label (marketplace “add account” row). */
  leading?: ReactNode;
  /** Popup flow: called when the OAuth popup completes or is closed. */
  onResult?: (result: ConnectCompleteResult) => void;
  /** Same-app path the OAuth callback returns to (`?connected=1` / `?error=`). Redirect flow only. */
  redirectTo?: string;
  size?: "sm" | "default";
  /**
   * The Space the new account will belong to — the one the connect started
   * in. Absent = the viewer's own account (the Copilot, personal settings).
   */
  spaceId?: string | null;
  variant?: "default" | "ghost" | "outline";
}

const POPUP_FEATURES = "popup,width=600,height=720";
const POPUP_CLOSED_POLL_MS = 500;
// A provider's opener policy can make the popup read as closed while the
// person is still signing in; the result then arrives on the channel. Keep
// listening this long after it looks closed.
const POPUP_RESULT_WAIT_MS = 10 * 60_000;

/**
 * Starts the OAuth flow: fetches the provider auth URL, then either redirects
 * the browser there (default) or drives it in a popup window that reports
 * back via postMessage (`flow="popup"`, used by the in-chat connect card).
 */
export function ConnectButton({
  connectorId,
  flow = "redirect",
  hasConnections = false,
  onResult,
  redirectTo = MY_CONNECTIONS_PATH,
  size = "sm",
  spaceId = null,
  label,
  leading,
  variant = "default",
  className,
}: ConnectButtonProps) {
  const { t } = useTranslation("connections");
  const [connecting, setConnecting] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    []
  );

  const watchPopup = (popup: Window) => {
    let settled = false;
    const settle = (result: ConnectCompleteResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      setConnecting(false);
      onResult?.(result);
    };
    const onMessage = (event: MessageEvent) => {
      const message = readConnectCompleteMessage(event);
      if (message) {
        settle(message);
      }
    };
    window.addEventListener("message", onMessage);
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CONNECT_COMPLETE_CHANNEL);
    channel?.addEventListener("message", (event) =>
      onMessage(
        new MessageEvent("message", {
          data: event.data,
          origin: window.location.origin,
        })
      )
    );
    let giveUp: number | null = null;
    const poll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(poll);
        setConnecting(false);
        giveUp = window.setTimeout(cleanup, POPUP_RESULT_WAIT_MS);
      }
    }, POPUP_CLOSED_POLL_MS);
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
      window.clearInterval(poll);
      if (giveUp !== null) {
        window.clearTimeout(giveUp);
      }
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
  };

  const connect = async () => {
    setConnecting(true);
    // Open synchronously inside the click gesture so popup blockers allow it;
    // the auth URL is assigned once fetched.
    const popup =
      flow === "popup"
        ? window.open("about:blank", "engenty-connect", POPUP_FEATURES)
        : null;
    try {
      const { authUrl } = await getConnectUrl({
        connectorId,
        redirectTo:
          flow === "popup" && popup
            ? CONNECT_COMPLETE_PATH
            : flow === "popup"
              ? // Popup blocked — fall back to a full redirect returning here.
                `${window.location.pathname}${window.location.search}`
              : redirectTo,
        target: spaceId,
      });
      if (popup) {
        popup.location.replace(authUrl);
        watchPopup(popup);
        return;
      }
      window.location.assign(authUrl);
    } catch (error) {
      popup?.close();
      setConnecting(false);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        /dynamic client registration failed \(403\)/i.test(message)
          ? t("toasts.dcrForbidden", {
              defaultValue:
                "This service only accepts approved apps for sign-in. Engenty is not on that list, so Authenticate cannot start. Use the REST connection with a personal access token instead.",
            })
          : t("toasts.connectStartFailed", { error: message })
      );
    }
  };

  return (
    <Button
      className={className}
      disabled={connecting}
      onClick={() => void connect()}
      size={size}
      type="button"
      variant={variant}
    >
      {leading}
      {connecting
        ? t("catalog.connecting")
        : (label ??
          (hasConnections ? t("catalog.addAccount") : t("catalog.connect")))}
    </Button>
  );
}
