/**
 * Favoriten: pinned conversations of any kind as large tiles above Inbox —
 * a desk's blob, a room's stacked blobs, a DM's blob with a lock. Empty
 * strip is omitted (no empty heading). Click opens the same place as the
 * row; drag reorders among pins or drops into a section (unpinning).
 */

import { rectSortingStrategy } from "@dnd-kit/sortable";
import { conversationEngagement } from "@engenty/ai-core/browser";
import { EngentyCluster } from "@engenty/ai-ui";
import { cn, Engenty } from "@engenty/ui-core";
import { Lock } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  isSpaceAgentNavActive,
  resolveSpaceAgentDestination,
  resolveSpaceChatDestination,
} from "@/lib/space-agent-nav";
import type { SpaceConversationItem } from "@/lib/space-conversation-sections";
import { spaceRoomPath } from "@/lib/space-routes";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import {
  SpaceConversationDraggable,
  SpaceConversationDropZone,
} from "./space-conversation-dnd";
import {
  openSpaceConversationNavMenu,
  SpaceConversationNavMenu,
} from "./space-conversation-nav-menu";

export const FAVORITES_CONTAINER_ID = "favorites";
const TILE_ENGENTY_PX = 48;

function tileLabel(
  item: SpaceConversationItem,
  rosterById: ReadonlyMap<string, SpaceRosterAgent>
): string {
  switch (item.kind) {
    case "desk":
      return item.agent.name;
    case "room":
      return (
        item.room.session.title?.trim() ||
        item.room.members
          .map(
            (member) => rosterById.get(member.agent_id)?.name ?? member.agent_id
          )
          .join(", ")
      );
    case "dm":
      return item.agent?.name ?? item.dm.agent_id;
    default:
      return "";
  }
}

function tileDestination(
  item: SpaceConversationItem,
  spaceKey: string
): string {
  switch (item.kind) {
    case "desk":
      return resolveSpaceAgentDestination(item.agent.id, spaceKey);
    case "room":
      return spaceRoomPath(spaceKey, item.room.session.id);
    case "dm":
      return resolveSpaceChatDestination(
        item.dm.agent_id,
        spaceKey,
        item.dm.session.id
      );
    default:
      return "";
  }
}

function SpaceFavoriteTile({
  item,
  rosterById,
  spaceKey,
}: {
  item: SpaceConversationItem;
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  spaceKey: string;
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openEngagement = searchParams.get("engagement");
  const active =
    item.kind === "room"
      ? location.pathname === spaceRoomPath(spaceKey, item.room.session.id)
      : isSpaceAgentNavActive(
          location.pathname,
          item.kind === "desk" ? item.agent.id : item.dm.agent_id,
          spaceKey
        ) &&
        (item.kind === "dm"
          ? openEngagement === conversationEngagement(item.dm.session.id)
          : true);
  const label = tileLabel(item, rosterById);

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
          "flex flex-col items-center gap-1 rounded-[8px] px-1 py-2 text-foreground",
          "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          active ? "bg-muted font-semibold" : "hover:bg-muted/60"
        )}
        data-testid="space-favorite-tile"
        to={tileDestination(item, spaceKey)}
      >
        <span
          aria-hidden
          className="relative grid size-12 shrink-0 place-items-center overflow-visible"
        >
          {item.kind === "room" ? (
            <EngentyCluster
              animated={active}
              kinds={item.room.members.map(
                (member) => rosterById.get(member.agent_id)?.engenty ?? "round"
              )}
              size={TILE_ENGENTY_PX}
            />
          ) : (
            <Engenty
              animated={active}
              className="[&_.e-shadow]:hidden"
              kind={
                item.kind === "desk"
                  ? item.agent.engenty
                  : (item.agent?.engenty ?? "round")
              }
              size={TILE_ENGENTY_PX}
            />
          )}
          {item.kind === "dm" ||
          (item.kind === "room" &&
            item.room.session.visibility === "private") ? (
            <span className="absolute right-0 bottom-0 grid size-4 place-items-center rounded-full bg-background">
              <Lock className="size-2.5 text-muted-foreground" />
            </span>
          ) : null}
        </span>
        <span className="w-full truncate text-center text-xs" title={label}>
          {label}
        </span>
      </Link>
      <span
        className="pointer-events-none absolute top-0.5 right-0.5 z-10 group-focus-within/item:pointer-events-auto group-hover/item:pointer-events-auto has-data-[state=open]:pointer-events-auto"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <SpaceConversationNavMenu
          isPinned
          item={item}
          sectionId={FAVORITES_CONTAINER_ID}
        />
      </span>
    </div>
  );
}

export function SpaceFavorites({
  items,
  rosterById,
  spaceKey,
}: {
  items: readonly SpaceConversationItem[];
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  spaceKey: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <SpaceConversationDropZone
      className="grid grid-cols-2 gap-1"
      id={FAVORITES_CONTAINER_ID}
      items={items.map((item) => item.key)}
      strategy={rectSortingStrategy}
    >
      {items.map((item) => (
        <SpaceConversationDraggable id={item.key} key={item.key}>
          <SpaceFavoriteTile
            item={item}
            rosterById={rosterById}
            spaceKey={spaceKey}
          />
        </SpaceConversationDraggable>
      ))}
    </SpaceConversationDropZone>
  );
}
