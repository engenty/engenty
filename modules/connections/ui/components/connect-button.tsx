import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ConnectionSharing } from "../api.js";
import { getConnectUrl } from "../api.js";
import {
  CONNECT_COMPLETE_PATH,
  type ConnectCompleteResult,
  readConnectCompleteMessage,
} from "../connect-popup.js";

export interface ConnectButtonProps {
  connectorId: string;
  /** `popup` keeps the current page (chat) and resolves via `onResult`. */
  flow?: "redirect" | "popup";
  /** Connections already exist — label the button "Add account" instead. */
  hasConnections?: boolean;
  /** Popup flow: called when the OAuth popup completes or is closed. */
  onResult?: (result: ConnectCompleteResult) => void;
  /** Same-app path the OAuth callback returns to (`?connected=1` / `?error=`). Redirect flow only. */
  redirectTo?: string;
  size?: "sm" | "default";
  /**
   * Mount the new account into this space on success (PLAN-spaces.md CN.4
   * Flow A) — set when the connect was started from inside one, so the user
   * comes back to a space that can actually use the account. Absent means a
   * tenant-level connect, which belongs to no space.
   */
  spaceId?: string | null;
  variant?: "default" | "outline";
}

const POPUP_FEATURES = "popup,width=600,height=720";
const POPUP_CLOSED_POLL_MS = 500;
// The completion page posts its message right before window.close(); give the
// message a moment to arrive after the closed-poll fires before declaring the
// flow cancelled.
const POPUP_CLOSED_GRACE_MS = 300;

/**
 * Starts the OAuth flow: fetches the provider auth URL, then either redirects
 * the browser there (default) or drives it in a popup window that reports
 * back via postMessage (`flow="popup"`, used by the in-chat connect card).
 * The dropdown chooses the sharing mode of the new connection.
 */
export function ConnectButton({
  connectorId,
  flow = "redirect",
  hasConnections = false,
  onResult,
  redirectTo = "/settings/connections",
  size = "sm",
  spaceId = null,
  variant = "default",
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
    const settle = (result: ConnectCompleteResult | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      setConnecting(false);
      if (result) {
        onResult?.(result);
      }
    };
    const onMessage = (event: MessageEvent) => {
      const message = readConnectCompleteMessage(event);
      if (message) {
        settle(message);
      }
    };
    window.addEventListener("message", onMessage);
    const poll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(poll);
        // A just-posted completion message may still be in flight.
        window.setTimeout(() => settle(null), POPUP_CLOSED_GRACE_MS);
      }
    }, POPUP_CLOSED_POLL_MS);
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
  };

  const connect = async (sharing: ConnectionSharing) => {
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
        sharing,
        spaceId,
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
      toast.error(
        t("toasts.connectStartFailed", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={connecting}
          size={size}
          type="button"
          variant={variant}
        >
          {connecting
            ? t("catalog.connecting")
            : hasConnections
              ? t("catalog.addAccount")
              : t("catalog.connect")}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void connect("personal")}>
          {t("catalog.connectPersonal")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void connect("org")}>
          {t("catalog.connectOrg")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
