/**
 * Notifications on the Space home: this space's open attention rows
 * (`useSpaceAttention`, read by the page) as ONE collapsed stack — the
 * newest card on top, the rest peeking out under it, opened in place.
 * "All (n)" opens the space's notifications page. Nothing waits → nothing
 * rendered.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  type NotificationDto,
  NotificationStacks,
  spaceInboxPath,
} from "@engenty/notifications-ui";
import { Button } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

export function SpaceHomeAttention({
  items,
  spaceKey,
}: {
  items: NotificationDto[];
  spaceKey: string;
}) {
  const { t, i18n } = useTranslation("common");
  if (items.length === 0) {
    return null;
  }
  const heading = t("spaces.home.sections.attention", {
    defaultValue: "Notifications",
  });
  return (
    <>
      <SpaceHomeSectionHeading
        action={
          <Button
            asChild
            className="h-6 px-1.5 text-muted-foreground text-xs"
            size="sm"
            variant="ghost"
          >
            <Link to={spaceInboxPath(spaceKey)}>
              {t("spaces.home.attention.all", {
                count: items.length,
                defaultValue: "All ({{count}})",
              })}
            </Link>
          </Button>
        }
      >
        {heading}
      </SpaceHomeSectionHeading>
      <NotificationStacks
        groupBy="one"
        locale={i18n.language || "en"}
        notifications={items}
      />
    </>
  );
}
