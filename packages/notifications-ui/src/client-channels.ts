// Client-side channels: what happens on THIS device when a record arrives
// while the app is open. The server channels (push, email) cover a closed
// app; these cover an open one — a browser tab in the background, the
// desktop shell in the dock.
//
// Registered once per shell (`registerClientChannel`), driven by one hook
// (`useClientChannels`) mounted with the bell so arrival detection runs in
// exactly one place.
import { useEffect, useRef } from "react";
import type { NotificationDto } from "./api.js";
import { isAttention, isUnseen } from "./classification.js";
import { notificationHref, notificationOrigin } from "./notification-href.js";
import { localizedSummary, notificationBodyText } from "./notification-item.js";
import { useNotificationsQuery } from "./queries.js";

export interface ClientChannel {
  id: string;
  /** Called once per newly arrived open record (never on the initial load). */
  onArrival(records: NotificationDto[]): void | Promise<void>;
}

const channels = new Map<string, ClientChannel>();

export function registerClientChannel(channel: ClientChannel): () => void {
  channels.set(channel.id, channel);
  return () => {
    channels.delete(channel.id);
  };
}

/**
 * A banner for one record, read like a macOS notification: where it came
 * from on top (space · actor), the title below, one more line when the
 * producer had one. `t` says the title in the viewer's language; without it
 * the server's English summary stands.
 */
export function notificationDisplayText(
  record: NotificationDto,
  t?: (key: string, options: Record<string, unknown>) => string
): {
  body: string;
  title: string;
} {
  const origin = notificationOrigin(record);
  const source =
    [origin.spaceName, origin.actorLabel].filter(Boolean).join(" · ") ||
    "engenty";
  const headline = t ? localizedSummary(record, t) : record.summary;
  const extra = notificationBodyText(record);
  const body = extra ? `${headline}\n${extra}` : headline;
  return { body: body.slice(0, 240), title: source };
}

/**
 * The browser channel: a Web Notification when the tab is open but not
 * focused. The service worker already covers a closed tab through web push;
 * this is the gap between the two.
 */
export const browserClientChannel: ClientChannel = {
  id: "browser",
  onArrival(records) {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      document.hasFocus()
    ) {
      return;
    }
    for (const record of records.slice(0, 3)) {
      const { body, title } = notificationDisplayText(record);
      const route = notificationHref(record);
      const shown = new Notification(title, {
        body,
        tag: record.dedupe_key ?? record.id,
      });
      shown.onclick = () => {
        window.focus();
        if (route) {
          window.location.assign(route);
        }
      };
    }
  },
};

/**
 * Watches the open list and hands newly arrived, unseen attention records
 * (`isAttention`) to every registered client channel. The first load only
 * learns what is there; a pre-seen row (the person whose turn parked) never
 * arrives. Mount once (the bell does).
 */
export function useClientChannels() {
  const query = useNotificationsQuery({ limit: 30, scope: "tenant" });
  const records = query.data?.notifications;
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!records) {
      return;
    }
    const previous = knownIds.current;
    knownIds.current = new Set(records.map((record) => record.id));
    if (previous === null) {
      return; // initial load — nothing "arrived"
    }
    const fresh = records.filter(
      (record) =>
        !previous.has(record.id) && isUnseen(record) && isAttention(record)
    );
    if (fresh.length === 0) {
      return;
    }
    for (const channel of channels.values()) {
      void Promise.resolve(channel.onArrival(fresh)).catch((error) => {
        console.warn(
          `[notifications] client channel ${channel.id} failed`,
          error
        );
      });
    }
  }, [records]);
}
