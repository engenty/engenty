/**
 * The Space's inbox, as the dashboard's topbar bell.
 *
 * It left the Work list to sit here: the home is where a person lands, and
 * "what waits for me in this space" is a number you glance at from there
 * rather than a row you scroll past. The count is this SPACE's open
 * Freigaben + Fehler — the same number the rail bell shows here.
 *
 * A popover, not a link: glance and act without leaving the dashboard. "View
 * all" still opens the full-screen list, which keeps this sidebar (Dashboard
 * stays selected).
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  NotificationInboxPanel,
  notificationInboxPopoverClassName,
  useSpaceNeedsInputCount,
} from "@engenty/notifications-ui";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { Bell } from "lucide-react";
import { useState } from "react";
import { spaceNotificationsPath } from "@/lib/space-routes";

export function SpaceHomeInboxBell({
  buttonClassName,
  spaceKey,
}: {
  buttonClassName?: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const count = useSpaceNeedsInputCount();
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("spaces.inbox", { defaultValue: "Inbox" })}
          className={cn(topbarIconButtonClassName, "relative", buttonClassName)}
          size="icon-sm"
          variant="ghost"
        >
          <Bell aria-hidden className="size-4" />
          {count > 0 ? (
            <span className="pointer-events-none absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[9px] text-primary-foreground tabular-nums leading-none">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={notificationInboxPopoverClassName}
        side="bottom"
        sideOffset={8}
      >
        <NotificationInboxPanel
          inSpace
          onNavigate={() => setOpen(false)}
          scopeLocked="space"
          viewAllHref={spaceNotificationsPath(spaceKey)}
        />
      </PopoverContent>
    </Popover>
  );
}
