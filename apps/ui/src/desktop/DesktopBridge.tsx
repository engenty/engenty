import { useInboxUnseenCountQuery } from "@engenty/ai-ui/embed";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isDesktopShell } from "./desktop-runtime";

/**
 * Bridges the running (authenticated) app to the desktop shell:
 * - mirrors the inbox unseen count onto the Dock badge
 * - posts a native notification when new items arrive while unfocused
 * - routes `engenty://open?path=/...` deep links into the SPA
 * - opens external http(s) links in the system browser
 *
 * Renders nothing; mounted only inside the Tauri shell.
 */
export function DesktopBridge() {
  if (!isDesktopShell()) {
    return null;
  }
  return <DesktopBridgeInner />;
}

function DesktopBridgeInner() {
  const navigate = useNavigate();
  const unseenCount = useInboxUnseenCountQuery().data?.count;
  const lastNotifiedCount = useRef<number | null>(null);

  // Dock badge + arrival notifications.
  useEffect(() => {
    if (unseenCount === undefined) {
      return;
    }
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setBadgeCount(
          unseenCount > 0 ? unseenCount : undefined
        );
      } catch (error) {
        console.warn("[desktop] failed to set badge count", error);
      }
      const previous = lastNotifiedCount.current;
      lastNotifiedCount.current = unseenCount;
      // Skip the initial load and decreases; only notify on new arrivals
      // while the window isn't focused.
      if (previous === null || unseenCount <= previous) {
        return;
      }
      try {
        if (document.hasFocus()) {
          return;
        }
        const { isPermissionGranted, requestPermission, sendNotification } =
          await import("@tauri-apps/plugin-notification");
        let granted = await isPermissionGranted();
        if (!granted) {
          granted = (await requestPermission()) === "granted";
        }
        if (granted) {
          const added = unseenCount - previous;
          sendNotification({
            body:
              added === 1
                ? "You have a new notification."
                : `You have ${added} new notifications.`,
            title: "engenty",
          });
        }
      } catch (error) {
        console.warn("[desktop] failed to send notification", error);
      }
    })();
  }, [unseenCount]);

  // Deep links: engenty://open?path=/some/route
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrent, onOpenUrl } = await import(
          "@tauri-apps/plugin-deep-link"
        );
        const handleUrls = (urls: string[] | null) => {
          for (const raw of urls ?? []) {
            try {
              const url = new URL(raw);
              if (url.protocol !== "engenty:") {
                continue;
              }
              const path = url.searchParams.get("path");
              if (path?.startsWith("/")) {
                navigate(path);
              }
            } catch {
              // Ignore malformed deep links.
            }
          }
        };
        handleUrls(await getCurrent());
        dispose = await onOpenUrl(handleUrls);
      } catch (error) {
        console.warn("[desktop] failed to install deep-link handler", error);
      }
    })();
    return () => dispose?.();
  }, [navigate]);

  // External links → system browser. Inside Tauri the app origin is
  // tauri://localhost, so every absolute http(s) link is external.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!(anchor && href && /^https?:\/\//i.test(href))) {
        return;
      }
      if (new URL(href).origin === window.location.origin) {
        return;
      }
      event.preventDefault();
      void import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(href))
        .catch((error) =>
          console.warn("[desktop] failed to open external link", error)
        );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
