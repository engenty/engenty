/**
 * A desk row in the conversation list: blob, the visibility marker when the
 * desk is not simply open (a lock in a personal space, a key in a private
 * one), agent name, when its desk line last moved, and that line's title
 * underneath. No conversation → New pill
 * where the timestamp would be, and no second line. Hover marquees
 * overflowing line-2 text only (paint/overflow). The menu is the row's ⋮;
 * right-click opens it too. Left-click opens the desk.
 *
 * While the agent has a live run, the second line says so instead — working,
 * or waiting for an answer only this person can give — with a dot beside the
 * name, because a row that says "vor 3 Minuten" while the agent is mid-job
 * reads as an agent that stopped.
 *
 * Its open attention rows (Wichtig) sit bottom-right as a pill beside the
 * link, not in it: the pill opens the bell on that agent, the row the desk.
 */
import {
  AgentFace,
  type AgentLiveActivity,
  type ChatVisibility,
  ChatVisibilityMarker,
  formatRelativeDate,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, SidebarRowTitleMarquee } from "@engenty/ui-core";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import type { SpaceAgentActivity } from "@/lib/space-agent-activity";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { AgentAttentionPill } from "./AgentAttentionPill";
import { openSpaceConversationNavMenu } from "./space-conversation-nav-menu";

export function SpaceAgentNavRow({
  active,
  activity,
  agent,
  attentionCount,
  destination,
  live,
  menu,
  visibility,
}: {
  active: boolean;
  activity: SpaceAgentActivity | undefined;
  agent: SpaceRosterAgent;
  /** Open attention rows whose actor is this agent. */
  attentionCount: number;
  destination: string;
  /** What this agent's runs say it is doing right now, if anything. */
  live: AgentLiveActivity | null;
  menu: ReactNode;
  /** How far the desk is visible — as wide as the space around it. */
  visibility: ChatVisibility;
}) {
  const { t } = useTranslation("common");
  const liveLabel =
    live === "needs_input"
      ? t("spaces.agents.live.needsInput", { defaultValue: "Waiting for you" })
      : live === "working"
        ? t("spaces.agents.live.working", { defaultValue: "Working…" })
        : null;
  const relativeTime = activity ? formatRelativeDate(activity.updatedAt) : null;
  const conversationTitle = activity
    ? activity.title?.trim() ||
      t("spaces.agents.untitledConversation", {
        defaultValue: "Untitled conversation",
      })
    : null;
  // Hovering anywhere on the row scrolls the second line into view; the
  // marquee's own hover would only cover the strip it occupies.
  const [hovered, setHovered] = useState(false);

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
          // Minor left padding: Engenty SVGs already sit inset in a 120×120
          // canvas, so the Inbox/module pl-2 inset pushes the blob right of
          // those icons. pl-1 is enough for the painted silhouette to share
          // their left edge. Hover chrome still spans the full row.
          "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
          "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          active ? "bg-muted font-semibold" : "hover:bg-muted/60"
        )}
        data-testid="space-agent-row"
        to={destination}
      >
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center overflow-visible"
        >
          <AgentFace
            animated={active}
            avatarUrl={agent.avatarUrl}
            className="[&_.e-shadow]:hidden"
            kind={agent.engenty}
            name={agent.name}
            size={38}
          />
        </span>
        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0 leading-none",
            // Line 2 stops short of the pill below the timestamp.
            attentionCount > 0 && "[&>*:last-child]:pr-[4.75rem]"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 leading-snug">
            <ChatVisibilityMarker kind="desk" visibility={visibility} />
            <span className="min-w-0 flex-1 truncate" title={agent.name}>
              {agent.name}
            </span>
            {live ? (
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  live === "needs_input"
                    ? "bg-ember-strong"
                    : "animate-pulse bg-primary"
                )}
              />
            ) : null}
            {/* Out of the way while the row is hovered: the ⋯ takes this
                corner, and a timestamp under a menu button is two things in
                one place. */}
            <span className="shrink-0 transition-opacity group-focus-within/item:opacity-0 group-hover/item:opacity-0 group-has-data-[state=open]/item:opacity-0">
              {relativeTime ? (
                <span className="font-normal text-[11px] text-muted-foreground leading-none">
                  {relativeTime}
                </span>
              ) : (
                <span className="rounded-full bg-ember-tint px-1.5 py-px font-semibold text-[10px] text-ember-strong uppercase leading-none tracking-wide">
                  {t("spaces.agents.new", { defaultValue: "New" })}
                </span>
              )}
            </span>
          </span>
          {liveLabel ? (
            <span
              className={cn(
                "block truncate font-normal text-xs leading-snug",
                live === "needs_input" ? "text-ember-strong" : "text-primary"
              )}
            >
              {liveLabel}
            </span>
          ) : conversationTitle ? (
            <SidebarRowTitleMarquee
              active={hovered}
              className="block"
              text={conversationTitle}
              textClassName="font-normal text-muted-foreground text-xs leading-snug"
            />
          ) : null}
        </span>
      </Link>
      <AgentAttentionPill
        agentId={agent.id}
        agentName={agent.name}
        className="absolute right-2 bottom-2 z-10"
        count={attentionCount}
      />
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
