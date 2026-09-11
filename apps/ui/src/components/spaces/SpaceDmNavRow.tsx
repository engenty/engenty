/**
 * A direct-message row: the agent's blob and name with a lock — one
 * person's private line with that agent, listed only for that person.
 * Opens the DM on the agent's desk.
 */
import { formatRelativeDate, type SpaceDmRow } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, Engenty } from "@engenty/ui-core";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { resolveSpaceChatDestination } from "@/lib/space-agent-nav";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { openSpaceConversationNavMenu } from "./space-conversation-nav-menu";

export function SpaceDmNavRow({
  active,
  agent,
  dm,
  menu,
  spaceKey,
}: {
  active: boolean;
  agent: SpaceRosterAgent | null;
  dm: SpaceDmRow;
  menu: ReactNode;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const name = agent?.name ?? dm.agent_id;
  return (
    <div
      className="group/item relative"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSpaceConversationNavMenu(event);
      }}
    >
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
          "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          active ? "bg-muted font-semibold" : "hover:bg-muted/60"
        )}
        data-testid="space-dm-row"
        to={resolveSpaceChatDestination(dm.agent_id, spaceKey, dm.session.id)}
      >
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center overflow-visible"
        >
          <Engenty
            animated={active}
            className="[&_.e-shadow]:hidden"
            kind={agent?.engenty ?? "round"}
            size={38}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0 leading-none">
          <span className="flex min-w-0 items-center gap-1.5 leading-snug">
            <span className="min-w-0 flex-1 truncate" title={name}>
              {name}
            </span>
            <Lock
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="shrink-0 font-normal text-[11px] text-muted-foreground leading-none transition-opacity group-focus-within/item:opacity-0 group-hover/item:opacity-0 group-has-data-[state=open]/item:opacity-0">
              {formatRelativeDate(dm.session.updated_at)}
            </span>
          </span>
          <span className="block truncate font-normal text-muted-foreground text-xs leading-snug">
            {t("spaces.conversations.dmLine", { defaultValue: "Only you" })}
          </span>
        </span>
      </Link>
      <span
        className="pointer-events-none absolute top-1 right-1 z-10 group-focus-within/item:pointer-events-auto group-hover/item:pointer-events-auto has-data-[state=open]:pointer-events-auto"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {menu}
      </span>
    </div>
  );
}
