import { useInboxUnseenCountQuery } from "@engenty/ai-ui/embed";
import type { NavigationSection } from "@engenty/app-shell";
import { getOptionalSupabaseAuthClient } from "@engenty/auth-ui";
import { useQueryClient } from "@engenty/query-client";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isDesktopShell } from "./desktop-runtime";

/** Emitted by the native menu / hotkey (see apps/desktop/src-tauri/src/lib.rs). */
const NAVIGATE_EVENT = "engenty-desktop:navigate";
const NEW_CHAT_EVENT = "engenty-desktop:new-chat";
const SETTINGS_EVENT = "engenty-desktop:settings";
const QUICK_CAPTURE_EVENT = "engenty-desktop:quick-capture";

export interface DesktopBridgeProps {
  /** Sidebar navigation, mirrored into the native Go menu (⌘1–⌘9). */
  sections?: NavigationSection[];
  /** Realtime inbox invalidation rides the per-tenant broadcast channel. */
  tenantId?: string;
}

/**
 * Bridges the running (authenticated) app to the desktop shell:
 * - mirrors the inbox unseen count onto the Dock badge
 * - posts a native notification when new items arrive while unfocused
 * - routes `engenty://open?path=/...` deep links into the SPA
 * - opens external http(s) links in the system browser
 * - mirrors the sidebar navigation into the native Go menu (⌘1–⌘9)
 * - handles native menu / global-hotkey events (New Chat, Settings, ⌥Space)
 * - subscribes to the per-tenant inbox broadcast channel so badge and
 *   notifications react immediately instead of on the next poll
 *
 * Renders nothing; mounted only inside the Tauri shell.
 */
export function DesktopBridge(props: DesktopBridgeProps) {
  if (!isDesktopShell()) {
    return null;
  }
  return <DesktopBridgeInner {...props} />;
}

function DesktopBridgeInner({ sections, tenantId }: DesktopBridgeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const unseenCount = useInboxUnseenCountQuery().data?.count;
  const lastNotifiedCount = useRef<number | null>(null);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

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

  // Realtime inbox: the AI service broadcasts on `inbox:{tenantId}` whenever a
  // notification is created or its status changes; refresh the inbox queries
  // immediately instead of waiting for the 30s poll.
  useEffect(() => {
    if (!tenantId) {
      return;
    }
    const client = getOptionalSupabaseAuthClient();
    if (!client) {
      return;
    }
    const channel = client
      .channel(`inbox:${tenantId}`)
      .on("broadcast", { event: "inbox-changed" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient, tenantId]);

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
            dispose();
          } else {
            disposers.push(dispose);
          }
        };
        await register(NAVIGATE_EVENT, (payload) => {
          if (typeof payload === "string" && payload.startsWith("/")) {
            navigate(payload);
          }
        });
        await register(NEW_CHAT_EVENT, () => navigate("/chat/new"));
        await register(SETTINGS_EVENT, () => navigate("/settings"));
        await register(QUICK_CAPTURE_EVENT, () => {
          // Opens the copilot drawer in place — the provider watches for
          // `?copilot=open` (see copilot-provider-content.tsx).
          navigate({
            pathname: pathnameRef.current,
            search: "?copilot=open",
          });
        });
      } catch (error) {
        console.warn("[desktop] failed to install menu listeners", error);
      }
    })();
    return () => {
      disposed = true;
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [navigate]);

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
