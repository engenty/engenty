import type { NavigationSection } from "@engenty/app-shell";
import {
  notificationDisplayText,
  registerClientChannel,
  useUnseenCountQuery,
} from "@engenty/notifications-ui";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isDesktopShell } from "./desktop-runtime";

/** Emitted by the native menu / hotkey (see apps/desktop/src-tauri/src/lib.rs). */
const NAVIGATE_EVENT = "engenty-desktop:navigate";
const NEW_CHAT_EVENT = "engenty-desktop:new-chat";
const SETTINGS_EVENT = "engenty-desktop:settings";

export interface DesktopBridgeProps {
  /** Sidebar navigation, mirrored into the native Go menu (⌘1–⌘9). */
  sections?: NavigationSection[];
}

/**
 * Bridges the running (authenticated) app to the desktop shell:
 * - mirrors the unseen notification count onto the Dock badge
 * - registers the `desktop` client channel: a native notification when new
 *   records arrive while the window is unfocused (arrival detection and the
 *   realtime refresh live with the bell, once per shell)
 * - routes `engenty://open?path=/...` deep links into the SPA
 * - opens external http(s) links in the system browser
 * - mirrors the sidebar navigation into the native Go menu (⌘1–⌘9)
 * - handles native menu / global-hotkey events (New Chat, Settings, ⌥Space)
 *
 * Renders nothing; mounted only inside the Tauri shell.
 */
export function DesktopBridge(props: DesktopBridgeProps) {
  if (!isDesktopShell()) {
    return null;
  }
  return <DesktopBridgeInner {...props} />;
}

/**
 * Tauri's unlisten throws `listeners[eventId].handlerId undefined` if the
 * listener is already gone (double-cleanup or a registration that never
 * resolved). Unsubscribing is best-effort — never let it surface an overlay.
 */
function safeDispose(dispose: () => void): void {
  try {
    dispose();
  } catch {
    // Listener already removed — nothing to do.
  }
}

// Registered once per process: the bell's arrival watcher hands new records
// to every client channel; this one turns them into native notifications
// while the window is not focused.
registerClientChannel({
  id: "desktop",
  async onArrival(records) {
    if (document.hasFocus()) {
      return;
    }
    try {
      const { isPermissionGranted, requestPermission, sendNotification } =
        await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (!granted) {
        return;
      }
      for (const record of records.slice(0, 3)) {
        sendNotification(notificationDisplayText(record));
      }
      if (records.length > 3) {
        sendNotification({
          body: `…and ${records.length - 3} more new notifications.`,
          title: "engenty",
        });
      }
    } catch (error) {
      console.warn("[desktop] failed to send notification", error);
    }
  },
});

function DesktopBridgeInner({ sections }: DesktopBridgeProps) {
  const navigate = useNavigate();
  // Keep the native-listener effects mount-once: react-router's `navigate`
  // changes identity on every route change, so depending on it re-runs the
  // Tauri listen()/unlisten() churn on each navigation — which races Tauri's
  // internal listener registry (unregisterListener → listeners[eventId] is
  // undefined). A ref reads the latest navigate without re-subscribing.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Dock badge: the tenant-wide unseen count the bell shows. The query polls
  // while hidden inside the desktop shell, so a tray/dock window stays live.
  const countQuery = useUnseenCountQuery();
  const unseen = countQuery.data?.total ?? 0;
  useEffect(() => {
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setBadgeCount(unseen > 0 ? unseen : undefined);
      } catch (error) {
        console.warn("[desktop] failed to set badge count", error);
      }
    })();
  }, [unseen]);

  // Native Go menu mirrors the sidebar navigation (labels + routes).
  useEffect(() => {
    if (!sections?.length) {
      return;
    }
    const seen = new Set<string>();
    const items: Array<{ label: string; path: string }> = [];
    for (const section of sections) {
      for (const item of section.items) {
        if (item.external || !item.to.startsWith("/") || seen.has(item.to)) {
          continue;
        }
        seen.add(item.to);
        items.push({ label: item.label, path: item.to });
      }
    }
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_navigation_menu", { items }))
      .catch((error) =>
        console.warn("[desktop] failed to sync navigation menu", error)
      );
  }, [sections]);

  // Native menu / hotkey events → SPA actions.
  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const register = async (
          event: string,
          handler: (payload: unknown) => void
        ) => {
          const dispose = await listen(event, (received) =>
            handler(received.payload)
          );
          if (disposed) {
            safeDispose(dispose);
          } else {
            disposers.push(dispose);
          }
        };
        await register(NAVIGATE_EVENT, (payload) => {
          if (typeof payload === "string" && payload.startsWith("/")) {
            navigateRef.current(payload);
          }
        });
        // New chat: the menu's ⌘N and the global ⌥Space hotkey both land here.
        await register(NEW_CHAT_EVENT, () => navigateRef.current("/chat/new"));
        await register(SETTINGS_EVENT, () => navigateRef.current("/settings"));
      } catch (error) {
        console.warn("[desktop] failed to install menu listeners", error);
      }
    })();
    return () => {
      disposed = true;
      for (const dispose of disposers) {
        safeDispose(dispose);
      }
    };
  }, []);

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
                navigateRef.current(path);
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
    return () => {
      if (dispose) {
        safeDispose(dispose);
      }
    };
  }, []);

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
