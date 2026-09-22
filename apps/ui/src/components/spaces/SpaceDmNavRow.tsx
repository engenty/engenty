/**
 * A private-line row: the agent's face, the closed lock before the name — one
 * person's private conversation with that agent, listed only for that person.
 *
 * Two kinds of row share this shape. A specialist's DM opens on its desk in
 * this space. The RIVER — the copilot's DM, which has no space because the
 * copilot follows the person everywhere — opens the copilot's page inside
 * this space, wears the copilot's blob, and says so: it is the same row in
 * every space because it is the same conversation.
 */
import {
  AgentFace,
  ChatVisibilityMarker,
  copilotRiverPath,
  formatRelativeDate,
  isCopilotRiverPathname,
  type SpaceDmRow,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { BlobAvatar, cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  const river = dm.session.space_id === null;
  const isActive = river ? isCopilotRiverPathname(pathname) : active;
  const name = river ? t("copilot.title") : (agent?.name ?? dm.agent_id);
  const href = river
    ? copilotRiverPath(spaceKey)
    : resolveSpaceChatDestination(dm.agent_id, spaceKey, dm.session.id);
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
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
          "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          isActive ? "bg-muted font-semibold" : "hover:bg-muted/60"
        )}
        data-testid={river ? "space-river-row" : "space-dm-row"}
        to={href}
      >
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center overflow-visible"
        >
          {river ? (
            // The blob from the app bar, at the desks' face size. Idle on
            // purpose: the row says "current" by its highlight, and the
            // thinking layers would draw past the slot.
            <BlobAvatar
              character="ember"
              className="[&_.blob-shadow]:hidden"
              size={26}
            />
          ) : (
            <AgentFace
              animated={isActive}
              avatarUrl={agent?.avatarUrl}
              className="[&_.e-shadow]:hidden"
              kind={agent?.engenty ?? "round"}
              name={name}
              size={38}
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0 leading-none">
          <span className="flex min-w-0 items-center gap-1.5 leading-snug">
            <ChatVisibilityMarker visibility="private" />
            <span className="min-w-0 flex-1 truncate" title={name}>
              {name}
            </span>
            <span className="shrink-0 font-normal text-[11px] text-muted-foreground leading-none transition-opacity group-focus-within/item:opacity-0 group-hover/item:opacity-0 group-has-data-[state=open]/item:opacity-0">
              {formatRelativeDate(dm.session.updated_at)}
            </span>
          </span>
          <span className="block truncate font-normal text-muted-foreground text-xs leading-snug">
            {river
              ? t("spaces.conversations.riverLine", {
                  defaultValue: "Only you · everywhere",
                })
              : t("spaces.conversations.dmLine", { defaultValue: "Only you" })}
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
