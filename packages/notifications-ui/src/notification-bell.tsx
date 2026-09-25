// The bell, in the app rail just above the personal avatar: how many open
// records need attention (Wichtig — `isAttention`), seen or not. Ordinary
// updates are FYI and stay off the badge. Mounts the client-channel watcher,
// the realtime subscription and the `openNotificationInbox` listener, so each
// runs exactly once per shell.

import { useAppBarChromeContext } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useClientChannels } from "./client-channels.js";
import { type InboxOpenRequest, useInboxOpenRequests } from "./inbox-open.js";
import {
  NotificationInboxPanel,
  notificationInboxPopoverClassName,
} from "./notification-inbox-panel.js";
import { spaceKeyFromPathname } from "./notification-paths.js";
import { useAttentionCount } from "./queries.js";
import { useNotificationsRealtime } from "./realtime.js";

export { NOTIFICATIONS_PATH } from "./notification-paths.js";

/**
 * Styled as a rail item (same box and hover treatment as the app tiles)
 * rather than a toolbar button: the bell lives in the app rail.
 */
function BellButton({ count, open }: { count: number; open: boolean }) {
  const { t } = useTranslation("common");
  const { extended } = useAppBarChromeContext();
  const label = t("notifications.bell", { defaultValue: "Notifications" });
  const badge =
    count > 0 ? (
      <span
        className={cn(
          "flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground tabular-nums leading-none",
          extended ? "shrink-0" : "absolute top-0.5 right-0.5"
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  if (extended) {
    // Labelled rail: same row as a module item, the count at the row's end.
    return (
      <button
        aria-label={label}
        className={cn(
          "group/item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground text-sm transition-colors",
          open
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
        type="button"
      >
        <span className="flex size-6 shrink-0 items-center justify-center transition-transform duration-200 ease-out group-hover/item:scale-110">
          <Bell className="size-full" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge}
      </button>
    );
  }

  return (
    <button
      aria-label={label}
      className={cn(
        "group/item relative mx-auto flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-shadow",
        // Match app-shell rail-tile chrome (chat / tasks / spaces).
        open
          ? "shadow-[0_2px_8px_rgb(0_0_0/0.35)] ring-2 ring-sidebar-foreground/90"
          : "hover:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)] focus-visible:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)]"
      )}
      type="button"
    >
      <Bell className="size-5 transition-transform duration-200 ease-out group-hover/item:scale-110" />
      {badge}
    </button>
  );
}

export interface NotificationBellProps {
  className?: string;
  /** Where the list opens. Placement is still being settled; this is a prop. */
  surface?: "popover" | "drawer";
}

export function NotificationBell({
  className,
  surface = "popover",
}: NotificationBellProps) {
  const { currentTenant } = useWorkspaceContext();
  const { pathname } = useLocation();
  const { extended, tooltipSide } = useAppBarChromeContext();
  const [open, setOpen] = useState(false);
  // Set while the panel was opened for a lane / one agent; a plain click on
  // the bell opens it on the defaults again.
  const [request, setRequest] = useState<InboxOpenRequest | null>(null);
  const [requestSeq, setRequestSeq] = useState(0);
  useNotificationsRealtime(currentTenant?.id ?? null);
  useClientChannels();
  useInboxOpenRequests((next) => {
    setRequest(next);
    setRequestSeq((seq) => seq + 1);
    setOpen(true);
  });
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setRequest(null);
    }
  };
  // Read the URL — the rail sits outside the space route's params.
  const inSpace = spaceKeyFromPathname(pathname) !== null;
  const count = useAttentionCount(inSpace ? "space" : "tenant");

  const panel = (
    <NotificationInboxPanel
      initial={request}
      inSpace={inSpace}
      // A new request re-reads its lane and actor even while open.
      key={requestSeq}
      onNavigate={() => onOpenChange(false)}
    />
  );

  if (surface === "drawer") {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetTrigger asChild>
          <span
            className={cn(
              "flex w-full",
              extended ? "" : "justify-center",
              className
            )}
          >
            <BellButton count={count} open={open} />
          </span>
        </SheetTrigger>
        <SheetContent className="w-[32rem] max-w-full p-0" side="left">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <span
          className={cn(
            "flex w-full",
            extended ? "" : "justify-center",
            className
          )}
        >
          <BellButton count={count} open={open} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={notificationInboxPopoverClassName}
        collisionPadding={12}
        // Away from the app bar, whichever edge it is docked on.
        side={tooltipSide}
        sideOffset={12}
        style={{ height: "min(40rem, calc(100dvh - 1.5rem))" }}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
