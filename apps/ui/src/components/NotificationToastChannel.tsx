/**
 * The in-app side of notifications while the app is open:
 *
 * - the banner channel — a newly arrived attention record slides in top
 *   right as the same card the bell shows (face, who, title, one line, the
 *   result chip, the verb), one banner per agent with "+N" when it said more
 *   than one thing at once;
 * - the browser channel — a Web Notification while the tab is in the
 *   background (the desktop shell has its own native one);
 * - the agents' faces on every card.
 *
 * Arrival detection lives with the bell (`useClientChannels`: never on the
 * first load, never a row this person already saw); this only skips rows
 * they caused themselves. Mounted once per shell next to the desktop bridge.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  browserClientChannel,
  groupIntoStacks,
  NotificationCard,
  type NotificationDto,
  openNotificationInbox,
  registerClientChannel,
  registerNotificationFace,
} from "@engenty/notifications-ui";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { isDesktopShell } from "@/desktop/desktop-runtime";
import { NotificationAgentFace } from "./NotificationAgentFace";

const TOASTER_ID = "notifications";
/** More at once is a flood, not news — the bell holds the rest. */
const MAX_BANNERS = 3;
const BANNER_MS = 8000;

function NotificationBanner({
  more,
  notification,
  toastId,
}: {
  more: number;
  notification: NotificationDto;
  toastId: number | string;
}) {
  const { t, i18n } = useTranslation("common");
  const close = () => toast.dismiss(toastId);
  return (
    <div className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-1">
      <NotificationCard
        locale={i18n.language || "en"}
        notification={notification}
        onClose={close}
        onNavigate={close}
        showSpace
        variant="banner"
      />
      {more > 0 ? (
        <button
          className="self-end px-2 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => {
            close();
            openNotificationInbox({ lane: "attention" });
          }}
          type="button"
        >
          {t("notifications.group.more", {
            count: more,
            defaultValue: "+{{count}} more",
          })}
        </button>
      ) : null}
    </div>
  );
}

export function NotificationToastChannel({ userId }: { userId: string }) {
  useEffect(() => registerNotificationFace(NotificationAgentFace), []);

  useEffect(
    () =>
      isDesktopShell()
        ? undefined
        : registerClientChannel(browserClientChannel),
    []
  );

  useEffect(
    () =>
      registerClientChannel({
        id: "banner",
        onArrival(records) {
          const others = records.filter(
            (record) =>
              !(record.actor_kind === "user" && record.actor_id === userId)
          );
          for (const stack of groupIntoStacks(others).slice(0, MAX_BANNERS)) {
            const [head, ...rest] = stack.items;
            if (!head) {
              continue;
            }
            toast.custom(
              (id) => (
                <NotificationBanner
                  more={rest.length}
                  notification={head}
                  toastId={id}
                />
              ),
              { duration: BANNER_MS, id: head.id, toasterId: TOASTER_ID }
            );
          }
        },
      }),
    [userId]
  );

  return (
    <Toaster
      gap={8}
      id={TOASTER_ID}
      offset={{ right: 16, top: 56 }}
      position="top-right"
      toastOptions={{ unstyled: true }}
      visibleToasts={MAX_BANNERS}
    />
  );
}
