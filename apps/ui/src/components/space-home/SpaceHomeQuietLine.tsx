/**
 * The rows with nothing live and no pin (PLAN-space-home.md H2).
 *
 * One line, names only. A card here would say "last active three days ago",
 * which is the sentence this page exists to avoid.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Link } from "react-router-dom";
import type { SpaceConversationItem } from "@/lib/space-conversation-sections";
import { spaceChatsPath } from "@/lib/space-routes";

const NAMED = 6;

function nameOf(item: SpaceConversationItem): string {
  if (item.kind === "desk") {
    return item.agent.name;
  }
  if (item.kind === "dm") {
    return item.agent?.name ?? item.dm.agent_id;
  }
  return item.room.session.title?.trim() || item.room.session.id;
}

export function SpaceHomeQuietLine({
  items,
  spaceKey,
}: {
  items: readonly SpaceConversationItem[];
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  if (items.length === 0) {
    return null;
  }
  const names = items.slice(0, NAMED).map(nameOf).join(" · ");
  const rest = items.length - Math.min(items.length, NAMED);

  return (
    <p className="flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        {rest > 0 ? `${names} +${rest}` : names}
      </span>
      <Link
        className="shrink-0 font-medium text-link hover:underline"
        to={spaceChatsPath(spaceKey)}
      >
        {t("spaces.home.quietAll", { defaultValue: "See all" })}
      </Link>
    </p>
  );
}
