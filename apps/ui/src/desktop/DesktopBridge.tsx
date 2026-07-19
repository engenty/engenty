import { type InboxNotificationDto, listInbox } from "@engenty/ai-ui/embed";
import { useQuery } from "@engenty/query-client";
import { listUsers } from "@engenty/user-management-ui";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isDesktopShell } from "./desktop-runtime";

/**
 * Bridges the running (authenticated) app to the desktop shell:
 * - mirrors the inbox unseen count onto the Dock badge
 * - posts a native notification when new items arrive while unfocused
 *   (team-chat records get channel + author + preview; others the summary)
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

const UNSEEN_STATUSES = new Set(["pending", "delivered"]);

/** Title/body for one record; team-chat payloads carry structured context. */
function renderNotification(
  record: InboxNotificationDto,
  userLabel: (id: string) => string | null
): { body: string; title: string } {
  const payload = record.payload ?? {};
  if (record.source !== "team-chat") {
    return { body: record.summary, title: "engenty" };
  }
  const label =
    typeof payload.conversation_label === "string"
      ? payload.conversation_label
      : "Team-Chat";
  const author =
    typeof payload.author_user_id === "string"
      ? userLabel(payload.author_user_id)
      : typeof payload.author_agent_key === "string"
        ? payload.author_agent_key
        : null;
  const preview =
    typeof payload.text_preview === "string" && payload.text_preview
      ? payload.text_preview
      : record.summary;
  return {
    body: author ? `${author}: ${preview}` : preview,
    title: label,
  };
}

function DesktopBridgeInner() {
  const navigate = useNavigate();
  // Bridge-owned poll (NOT the shared inbox queries): background refetch must
  // stay on so a hidden/tray window still notices arrivals.
  const inboxQuery = useQuery({
    queryFn: ({ signal }) => listInbox({ limit: 30, status: "open" }, signal),
    queryKey: ["desktop", "inbox-open"],
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });
  const usersQuery = useQuery({
    queryFn: () => listUsers(),
    queryKey: ["desktop", "tenant-users"],
    staleTime: 5 * 60_000,
  });
  const users = usersQuery.data;
  const records = inboxQuery.data?.notifications;
  const knownIds = useRef<Set<string> | null>(null);

  // Dock badge + arrival notifications.
  useEffect(() => {
    if (!records) {
      return;
    }
    const unseen = records.filter((record) =>
      UNSEEN_STATUSES.has(record.status)
    );
    const previous = knownIds.current;
    knownIds.current = new Set(records.map((record) => record.id));
    const fresh =
      previous === null
        ? [] // initial load — badge only, no notification burst
        : unseen.filter((record) => !previous.has(record.id));
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setBadgeCount(
          unseen.length > 0 ? unseen.length : undefined
        );
      } catch (error) {
        console.warn("[desktop] failed to set badge count", error);
      }
      // Only notify on arrivals while the window isn't focused.
      if (fresh.length === 0 || document.hasFocus()) {
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
        const userLabel = (id: string) =>
          users?.find((user) => user.id === id)?.display_name || null;
        for (const record of fresh.slice(0, 3)) {
          sendNotification(renderNotification(record, userLabel));
        }
        if (fresh.length > 3) {
          sendNotification({
            body: `…and ${fresh.length - 3} more new notifications.`,
            title: "engenty",
          });
        }
      } catch (error) {
        console.warn("[desktop] failed to send notification", error);
      }
    })();
  }, [records, users]);

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
