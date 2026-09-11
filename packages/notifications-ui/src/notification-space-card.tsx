// The space's own count: what waits in THIS space (tenant-global records
// included). Reads `in_space` off the same poll the bell uses.
import { useTranslation } from "@engenty/i18n/ui";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { spaceInboxPath } from "./notification-paths.js";
import { useUnseenCountQuery } from "./queries.js";

export function NotificationSpaceCard({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation("common");
  const countQuery = useUnseenCountQuery();
  const count = countQuery.data?.in_space ?? countQuery.data?.total ?? 0;
  if (count === 0) {
    return null;
  }
  return (
    <Link
      className="ui-card-raised ui-card-interactive flex items-center gap-3 px-3.5 py-3"
      to={spaceInboxPath(spaceKey)}
    >
      <Inbox aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 font-medium text-sm">
        {t("notifications.spaceCard", {
          count,
          defaultValue: "{{count}} things need your attention in this space",
        })}
      </span>
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground tabular-nums leading-none">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}
