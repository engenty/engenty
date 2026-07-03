// Compact inbox section on the Briefing screen: the most recent open
// notifications with a link to the full inbox. Renders nothing while the
// inbox is empty so the briefing stays quiet by default.
import { useInboxListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { InboxList } from "./inbox-list.js";

export function BriefingInboxSection() {
  const { t, i18n } = useTranslation("tasks");
  const listQuery = useInboxListQuery({ limit: 5 });
  const notifications = (listQuery.data?.notifications ?? []).filter(
    (n) => n.status === "pending" || n.status === "delivered"
  );

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("inbox.title")}
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link to={tasksPaths.inbox}>{t("inbox.viewAll")}</Link>
        </Button>
      </div>
      <InboxList locale={i18n.language || "en"} notifications={notifications} />
    </div>
  );
}
