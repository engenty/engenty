// Web-push toggle (notifications N2): per browser/device — the subscription
// lives in this browser's push manager and is registered with apps/ai
// (/ai/v1/notifications/push/*). Strings use defaultValue fallbacks so the
// section works before the common namespace grows translations.
import { getSupabaseAuthClient } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card } from "@engenty/ui-core";
import { useCallback, useEffect, useState } from "react";

type PushState =
  | "disabled"
  | "enabled"
  | "loading"
  | "not-configured"
  | "unsupported";

async function aiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await getSupabaseAuthClient().auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`push api ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** VAPID public key (base64url) → applicationServerKey bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushNotificationsSection() {
  const { t } = useTranslation("common");
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        setState("unsupported");
        return;
      }
      try {
        const config = await aiJson<{ publicKey: string | null }>(
          "/ai/v1/notifications/push/config"
        );
        if (cancelled) {
          return;
        }
        if (!config.publicKey) {
          setState("not-configured");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setState(subscription ? "enabled" : "disabled");
        }
      } catch {
        if (!cancelled) {
          setState("not-configured");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          t("settings.pushPermissionDenied", {
            defaultValue:
              "Notifications are blocked for this site — allow them in the browser settings first.",
          })
        );
        return;
      }
      const config = await aiJson<{ publicKey: string | null }>(
        "/ai/v1/notifications/push/config"
      );
      if (!config.publicKey) {
        setState("not-configured");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        userVisibleOnly: true,
      });
      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { auth?: string; p256dh?: string };
      };
      if (!(json.endpoint && json.keys?.p256dh && json.keys.auth)) {
        throw new Error("subscription missing keys");
      }
      await aiJson("/ai/v1/notifications/push/subscriptions", {
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
          user_agent: navigator.userAgent.slice(0, 512),
        }),
        method: "POST",
      });
      setState("enabled");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await aiJson("/ai/v1/notifications/push/subscriptions", {
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          method: "DELETE",
        }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("disabled");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const statusText: Record<PushState, string> = {
    disabled: t("settings.pushDisabled", {
      defaultValue: "Off — this browser doesn't receive notifications.",
    }),
    enabled: t("settings.pushEnabled", {
      defaultValue: "On — this browser receives notifications.",
    }),
    loading: "…",
    "not-configured": t("settings.pushNotConfigured", {
      defaultValue:
        "Not available: this installation has no web-push keys configured (VAPID).",
    }),
    unsupported: t("settings.pushUnsupported", {
      defaultValue:
        "This browser doesn't support web push. On iPhone/iPad, add Engenty to the Home Screen first.",
    }),
  };

  return (
    <Card className="space-y-3 p-5" variant="form">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">
          {t("settings.pushNotifications", {
            defaultValue: "Push notifications",
          })}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("settings.pushNotificationsHelp", {
            defaultValue:
              "Get notified about mentions and direct messages on this device, even when Engenty isn't open.",
          })}
        </p>
      </div>
      <p className="text-muted-foreground text-sm">{statusText[state]}</p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {state === "disabled" || state === "enabled" ? (
        <Button
          disabled={busy}
          onClick={() => {
            void (state === "enabled" ? disable() : enable());
          }}
          size="sm"
          variant={state === "enabled" ? "outline" : "default"}
        >
          {state === "enabled"
            ? t("settings.pushDisableAction", { defaultValue: "Disable" })
            : t("settings.pushEnableAction", {
                defaultValue: "Enable on this device",
              })}
        </Button>
      ) : null}
    </Card>
  );
}
