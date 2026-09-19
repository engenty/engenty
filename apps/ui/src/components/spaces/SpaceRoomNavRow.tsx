/**
 * A room row in the conversation list, the way Slack lists a channel next
 * to the people: its agents' engenties as one cluster, the visibility marker
 * before the name (a key when only its members read it, an open lock when
 * the Space does), when it last moved, and what it is for. Opens the room's
 * own page.
 */
import {
  type ChatSpaceAudience,
  ChatVisibilityMarker,
  chatVisibilityOf,
  EngentyCluster,
  formatRelativeDate,
  type SpaceRoomRow,
} from "@engenty/ai-ui";
import { cn, SidebarRowTitleMarquee } from "@engenty/ui-core";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { spaceRoomPath } from "@/lib/space-routes";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { openSpaceConversationNavMenu } from "./space-conversation-nav-menu";

export function SpaceRoomNavRow({
  active,
  menu,
  room,
  rosterById,
  spaceAudience,
  spaceKey,
}: {
  active: boolean;
  menu: ReactNode;
  room: SpaceRoomRow;
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  /** How far the space reaches — what a room open to it amounts to. */
  spaceAudience: ChatSpaceAudience | null;
  spaceKey: string;
}) {
  const [hovered, setHovered] = useState(false);
  const kinds = room.members.map(
    (member) => rosterById.get(member.agent_id)?.engenty ?? "round"
  );
  const names = room.members
    .map((member) => rosterById.get(member.agent_id)?.name ?? member.agent_id)
    .join(", ");
  const purpose = room.session.metadata?.room_purpose;
  const secondLine =
    typeof purpose === "string" && purpose.trim() ? purpose.trim() : names;
  const title = room.session.title?.trim() || names;

  return (
    <div
      className="group/item relative"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSpaceConversationNavMenu(event);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
          "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          active ? "bg-muted font-semibold" : "hover:bg-muted/60"
        )}
        data-testid="space-room-row"
        to={spaceRoomPath(spaceKey, room.session.id)}
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center"
        >
          <EngentyCluster animated={active} kinds={kinds} size={32} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0 leading-none">
          <span className="flex min-w-0 items-center gap-1.5 leading-snug">
            <ChatVisibilityMarker
              kind="room"
              visibility={chatVisibilityOf(
                "room",
                room.session.visibility,
                spaceAudience
              )}
            />
            <span className="min-w-0 flex-1 truncate" title={title}>
              {title}
            </span>
            <span className="shrink-0 font-normal text-[11px] text-muted-foreground leading-none transition-opacity group-focus-within/item:opacity-0 group-hover/item:opacity-0 group-has-data-[state=open]/item:opacity-0">
              {formatRelativeDate(room.session.updated_at)}
            </span>
          </span>
          <SidebarRowTitleMarquee
            active={hovered}
            className="block"
            text={secondLine}
            textClassName="font-normal text-muted-foreground text-xs leading-snug"
          />
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
