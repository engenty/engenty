/**
 * The `toast` client channel: a sonner toast for every newly arrived
 * attention record (Wichtig) while the app is open — the title, where it
 * came from and one line under it, with one action that goes where it is
 * decided (the row's own target). Arrival detection
 * lives with the bell (`useClientChannels`: never on the first load, never a
 * row this person already saw); this only skips rows they caused themselves.
 *
 * Renders nothing; mounted once per shell next to the desktop bridge.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  actionVerb,
  localizedSummary,
  notificationBodyText,
  notificationHref,
  notificationOrigin,
  registerClientChannel,
} from "@engenty/notifications-ui";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

/** More at once is a flood, not news — the bell holds the rest. */
const MAX_TOASTS = 3;

export function NotificationToastChannel({ userId }: { userId: string }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  // Registered once; the ref reads the latest navigate / t / user.
  const latest = useRef({ navigate, t, userId });
  latest.current = { navigate, t, userId };

  useEffect(
    () =>
      registerClientChannel({
        id: "toast",
        onArrival(records) {
          const { navigate: go, t: translate, userId: me } = latest.current;
          const others = records.filter(
            (record) =>
              !(record.actor_kind === "user" && record.actor_id === me)
          );
          for (const record of others.slice(0, MAX_TOASTS)) {
            const origin = notificationOrigin(record);
            const title = localizedSummary(record, translate);
            const href = notificationHref(record);
            const source = [origin.spaceName, origin.actorLabel]
              .filter(Boolean)
              .join(" · ");
            const body = notificationBodyText(record);
            const description = [source, body].filter(Boolean).join(" — ");
            toast(title, {
              id: record.id,
              ...(description ? { description } : {}),
              ...(href
                ? {
                    action: {
                      label:
                        actionVerb(record, translate) ??
                        translate("notifications.open", {
                          defaultValue: "Open",
                        }),
                      onClick: () => go(href),
                    },
                  }
                : {}),
            });
          }
        },
      }),
    []
  );
  return null;
}
