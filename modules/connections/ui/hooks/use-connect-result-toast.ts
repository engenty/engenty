import { useTranslation } from "@engenty/i18n/ui";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

/**
 * Surface the OAuth callback outcome (`?connected=1` / `?error=...`) as a
 * toast and strip the params from the URL.
 */
export function useConnectResultToast() {
  const { t } = useTranslation("connections");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (!(connected || error)) {
      return;
    }
    if (connected) {
      // A fresh connection ships with autonomous use OFF — without this hint
      // the first signal is an inexplicably empty inbox days later.
      toast.success(t("toasts.connected"), {
        description: t("toasts.connectedAutonomyHint"),
      });
    } else if (error) {
      toast.error(t("toasts.connectFailed", { error }));
    }
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, t]);
}
