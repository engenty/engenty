// The bell, in the app rail under Settings: the tenant-wide unseen count, and
// the aggregate list in a popover (opening beside the rail) or a drawer.
// Deliberately not narrowed by the space the user is standing in — a decision
// waiting elsewhere is still waiting. Mounts the client-channel watcher and
// the realtime subscription, so both run exactly once per shell.

import { currentRequestSpaceId } from "@engenty/api-client";
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
import { useClientChannels } from "./client-channels.js";
import {
  NotificationInboxPanel,
  notificationInboxPopoverClassName,
} from "./notification-inbox-panel.js";
import { useUnseenCountQuery } from "./queries.js";
import { useNotificationsRealtime } from "./realtime.js";

export { NOTIFICATIONS_PATH } from "./notification-paths.js";

/**
 * Styled as a rail item (same box and hover treatment as the Settings tile
 * above it) rather than a toolbar button: the bell lives in the app rail.
 */
function BellButton({ count }: { count: number }) {
  const { t } = useTranslation("common");
  return (
    <button
      aria-label={t("notifications.bell", { defaultValue: "Notifications" })}
      className="group/item relative mx-auto flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
  const [open, setOpen] = useState(false);
  const countQuery = useUnseenCountQuery();
  useNotificationsRealtime(currentTenant?.id ?? null);
  useClientChannels();
  // Inside a space the badge counts what is waiting HERE (global blockers
  // included); the tenant-wide number stays one click away under "All".
  const inSpace = currentRequestSpaceId() !== null;
  const count =
    (inSpace ? countQuery.data?.in_space : null) ?? countQuery.data?.total ?? 0;

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
          <span className={cn("inline-flex", className)}>
            <BellButton count={count} />
          </span>
        </SheetTrigger>
        <SheetContent className="w-[420px] max-w-full p-0" side="left">
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
        <span className={cn("inline-flex", className)}>
          <BellButton count={count} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={notificationInboxPopoverClassName}
        side="right"
        sideOffset={8}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
