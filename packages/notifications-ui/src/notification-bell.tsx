// The bell, in the app rail just above the personal avatar: how many
// Freigaben + Fehler are still open. Same list the inbox tabs count, so the
// numbers add up. Updates are FYI and stay off the badge. Mounts the
// client-channel watcher and the realtime subscription, so both run exactly
// once per shell.

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
import {
  NotificationInboxPanel,
  notificationInboxPopoverClassName,
} from "./notification-inbox-panel.js";
import { spaceKeyFromPathname } from "./notification-paths.js";
import { useNeedsInputCount } from "./queries.js";
import { useNotificationsRealtime } from "./realtime.js";

export { NOTIFICATIONS_PATH } from "./notification-paths.js";

/**
 * Styled as a rail item (same box and hover treatment as the app tiles)
 * rather than a toolbar button: the bell lives in the app rail.
 */
function BellButton({ count, open }: { count: number; open: boolean }) {
  const { t } = useTranslation("common");
  return (
    <button
      aria-label={t("notifications.bell", { defaultValue: "Notifications" })}
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
      {count > 0 ? (
        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground tabular-nums leading-none">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
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
  const [open, setOpen] = useState(false);
  useNotificationsRealtime(currentTenant?.id ?? null);
  useClientChannels();
  // Freigaben + Fehler still open in this scope. Same list the inbox tabs
  // badge, so the numbers add up. Updates stay off every badge. Read the
  // URL — the rail sits outside the space route's params.
  const inSpace = spaceKeyFromPathname(pathname) !== null;
  const count = useNeedsInputCount(inSpace ? "space" : "tenant");

  const panel = (
    <NotificationInboxPanel
      inSpace={inSpace}
      onNavigate={() => setOpen(false)}
    />
  );

  if (surface === "drawer") {
    return (
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <span className={cn("flex w-full justify-center", className)}>
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
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <span className={cn("flex w-full justify-center", className)}>
          <BellButton count={count} open={open} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={notificationInboxPopoverClassName}
        collisionPadding={12}
        side="right"
        sideOffset={12}
        style={{ height: "min(40rem, calc(100vh - 1.5rem))" }}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
