/**
 * Wichtig on the Space home: the newest open attention rows of this space
 * (`useSpaceAttention`, read by the page), at most three, each with its action in place — decide
 * an approval, ✕ an FYI, open the rest. "All (n)" opens the bell on Wichtig.
 * Nothing waits → nothing rendered.
 */
import { AgentFace } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  NotificationAttentionCard,
  type NotificationDto,
  openNotificationInbox,
} from "@engenty/notifications-ui";
import { Button } from "@engenty/ui-core";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

const SHOWN = 3;

export function SpaceHomeAttention({
  items,
  rosterById,
}: {
  items: NotificationDto[];
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
}) {
  const { t, i18n } = useTranslation("common");
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <SpaceHomeSectionHeading
        action={
          <Button
            className="h-6 px-1.5 text-muted-foreground text-xs"
            onClick={() => openNotificationInbox({ lane: "attention" })}
            size="sm"
            variant="ghost"
          >
            {t("spaces.home.attention.all", {
              count: items.length,
              defaultValue: "All ({{count}})",
            })}
          </Button>
        }
      >
        {t("spaces.home.sections.attention", { defaultValue: "Important" })}
      </SpaceHomeSectionHeading>
      <ul className="flex flex-col gap-2.5">
        {items.slice(0, SHOWN).map((notification) => {
          const agent =
            notification.actor_kind === "agent" && notification.actor_id
              ? rosterById.get(notification.actor_id)
              : undefined;
          return (
            <NotificationAttentionCard
              face={
                agent ? (
                  <AgentFace
                    avatarUrl={agent.avatarUrl}
                    kind={agent.engenty}
                    name={agent.name}
                    size={32}
                  />
                ) : undefined
              }
              key={notification.id}
              locale={i18n.language || "en"}
              notification={notification}
            />
          );
        })}
      </ul>
    </>
  );
}
