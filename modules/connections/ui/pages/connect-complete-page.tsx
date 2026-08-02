"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  CONNECT_COMPLETE_MESSAGE_TYPE,
  type ConnectCompleteMessage,
  parseConnectCompleteSearch,
} from "../connect-popup.js";

/**
 * Landing page for the popup connect flow (`/connections/oauth/complete`).
 * The OAuth callback redirects the popup here; we report the result to the
 * opener window via postMessage and close. When there is no opener (deep link,
 * popup promoted to a tab), fall back to the connections settings page — its
 * toast handles the same `?connected=1` / `?error=` params.
 */
export function ConnectCompletePage() {
  const { t } = useTranslation("connections");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) {
      return;
    }
    const message: ConnectCompleteMessage = {
      ...parseConnectCompleteSearch(window.location.search),
      type: CONNECT_COMPLETE_MESSAGE_TYPE,
    };
    opener.postMessage(message, window.location.origin);
    setReported(true);
    window.close();
  }, []);

  if (!reported && typeof window !== "undefined" && !window.opener) {
    return (
      <Navigate replace to={`/settings/connections${window.location.search}`} />
    );
  }

  // Visible only in the brief moment before window.close(), or when the
  // browser refuses to close a script-opened window.
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">
        {t("connectComplete.closing")}
      </p>
    </div>
  );
}
