"use client";

import {
  type AgentEngentyKind,
  spaceRoomPathname,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
// The first breadcrumb of a desk or a room: what is open, with a chevron that
// lists every conversation of the Space — its agents' desks and its rooms —
// the same control the space chooser is, one level down. The caller hands in
// the label (a desk links to its root, a room opens its info panel); the
// chevron is the only thing that opens the menu, so a click on the name
// never surprises.
import { AgentFace } from "../../components/agent-face.js";
import {
  type ChatSpaceAudience,
  ChatVisibilityGlyphs,
  chatVisibilityOf,
} from "../../components/copilot/chat-visibility.js";
import { EngentyCluster } from "../../components/engenty-cluster.js";
import { spaceAgentDeskPath } from "../agent-form/hire-spaces.js";

export interface AgentDeskSwitchAgent {
  avatarUrl?: string | null;
  engenty: AgentEngentyKind;
  id: string;
  name: string;
}

/** A room as the switcher lists it: its name, its agents' engenties, its tier. */
export interface AgentDeskSwitchRoom {
  id: string;
  kinds: readonly AgentEngentyKind[];
  title: string;
  /** As stored: "private" for a members-only room, else the Space's. */
  visibility?: string | null;
}

export type AgentDeskSwitchCurrent =
  | { id: string; kind: "agent" }
  | { id: string; kind: "room" };

export function AgentDeskSwitcher({
  agents,
  current,
  label,
  rooms = [],
  spaceAudience,
  spaceKey,
}: {
  /** The Space's roster, the current agent included. */
  agents: readonly AgentDeskSwitchAgent[];
  current: AgentDeskSwitchCurrent;
  /** The crumb itself — the desk's link, the room's info button. Omitted
   * when the chevron hangs on another crumb (the desk puts it on the Space). */
  label?: ReactNode;
  /** The rooms the viewer is in, the current one included. */
  rooms?: readonly AgentDeskSwitchRoom[];
  /** How far the Space reaches — the tier of its desks and open rooms. */
  spaceAudience?: ChatSpaceAudience | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  // One entry is the current one; a menu of it alone says nothing.
  const showMenu = agents.length + rooms.length > 1;

  return (
    <span className="flex min-w-0 items-center gap-1">
      {label}
      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("agentDesk.switcher")}
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                "data-open:bg-muted data-open:text-foreground",
                "data-popup-open:bg-muted data-popup-open:text-foreground"
              )}
              data-testid="agent-desk-switcher"
              type="button"
            >
              <ChevronDown aria-hidden className="size-3 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {agents.length > 0 ? (
              <DropdownMenuLabel>
                {t("agentDesk.switcherGroups.agents")}
              </DropdownMenuLabel>
            ) : null}
            {agents.map((candidate) => (
              <DropdownMenuItem
                className={cn(
                  "gap-2",
                  current.kind === "agent" &&
                    candidate.id === current.id &&
                    "font-medium text-foreground"
                )}
                key={`agent:${candidate.id}`}
                onSelect={() =>
                  navigate(spaceAgentDeskPath(spaceKey, candidate.id))
                }
              >
                <AgentFace
                  avatarUrl={candidate.avatarUrl}
                  kind={candidate.engenty}
                  name={candidate.name}
                  size={18}
                />
                <span className="min-w-0 flex-1 truncate">
                  {candidate.name}
                </span>
                <ChatVisibilityGlyphs
                  kind="desk"
                  visibility={chatVisibilityOf("desk", null, spaceAudience)}
                />
              </DropdownMenuItem>
            ))}
            {rooms.length > 0 ? (
              <>
                {agents.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel>
                  {t("agentDesk.switcherGroups.rooms")}
                </DropdownMenuLabel>
                {rooms.map((room) => (
                  <DropdownMenuItem
                    className={cn(
                      "gap-2",
                      current.kind === "room" &&
                        room.id === current.id &&
                        "font-medium text-foreground"
                    )}
                    key={`room:${room.id}`}
                    onSelect={() =>
                      navigate(spaceRoomPathname(spaceKey, room.id))
                    }
                  >
                    <EngentyCluster kinds={room.kinds} size={18} />
                    <span className="min-w-0 flex-1 truncate">
                      {room.title}
                    </span>
                    <ChatVisibilityGlyphs
                      kind="room"
                      visibility={chatVisibilityOf(
                        "room",
                        room.visibility,
                        spaceAudience
                      )}
                    />
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
}
