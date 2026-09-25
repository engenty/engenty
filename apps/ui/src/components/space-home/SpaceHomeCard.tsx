/**
 * One conversation on the Space home (PLAN-space-home.md H2–H5).
 *
 * The same three kinds the sidebar lists, in one card shape: a desk carries
 * its agent's engenty, a room the cluster of its members, a DM its agent and
 * a lock. Inside, one row per live job — an engenty runs in parallel across
 * rooms (PLAN-agent-rooms.md D6), so a card is a list, not a sentence.
 *
 * A pinned card carries the composer so you can write from the home —
 * including when something is waiting for you. The input is the answer;
 * a second "Answer" button next to it would only send you to the same place.
 */
import {
  AgentFace,
  agentDeskHostKey,
  agentRoomHostKey,
  EngentyCluster,
  formatRelativeDate,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import { Lock } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Space } from "@/lib/api/spaces-client";
import { spaceConversationSearch } from "@/lib/space-conversation-open";
import type { SpaceHomeCard as SpaceHomeCardModel } from "@/lib/space-home-cards";
import { spaceAgentDeskPath, spaceRoomPath } from "@/lib/space-routes";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { AgentAttentionPill } from "../spaces/AgentAttentionPill";
import { SpaceHomeComposer } from "./SpaceHomeComposer";
import { SpaceHomeJobRow } from "./SpaceHomeJobRow";

/**
 * How far the last message and the composer stay clear of the card's right
 * edge — roughly the engenty gutter on the left, so the chat blocks read as
 * one inset column between two margins.
 */
const CHAT_BLOCK_INSET = "mr-4 @min-[22rem]:mr-12";

function cardTitle(card: SpaceHomeCardModel): string {
  const { item } = card;
  if (item.kind === "desk") {
    return item.agent.name;
  }
  if (item.kind === "dm") {
    return item.agent?.name ?? item.dm.agent_id;
  }
  return item.room.session.title?.trim() || item.room.session.id;
}

function cardPath(card: SpaceHomeCardModel, spaceKey: string): string {
  const { item } = card;
  if (item.kind === "desk") {
    return spaceAgentDeskPath(spaceKey, item.agent.id);
  }
  if (item.kind === "dm") {
    return spaceRoomPath(spaceKey, item.dm.session.id);
  }
  return spaceRoomPath(spaceKey, item.room.session.id);
}

function StateBadge({ card }: { card: SpaceHomeCardModel }) {
  const { t } = useTranslation("common");
  const labels: Record<SpaceHomeCardModel["state"], string> = {
    done: t("spaces.home.cards.state.done", { defaultValue: "done" }),
    paused: t("spaces.home.cards.state.paused", { defaultValue: "paused" }),
    quiet: t("spaces.home.cards.state.quiet", { defaultValue: "nothing open" }),
    running: t("spaces.home.cards.state.running", { defaultValue: "running" }),
    waiting: t("spaces.home.cards.state.waiting", {
      defaultValue: "waiting for you",
    }),
  };
  const tone =
    card.state === "waiting" || card.state === "paused"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : card.state === "running"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : "border-transparent bg-muted text-muted-foreground";
  return (
    <Badge className={cn("font-medium text-[11px] uppercase", tone)}>
      {labels[card.state]}
    </Badge>
  );
}

export function SpaceHomeCard({
  attentionCount,
  card,
  rosterById,
  space,
}: {
  /** A desk's open attention rows (Wichtig) whose actor is its agent. */
  attentionCount: number;
  card: SpaceHomeCardModel;
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  space: Space;
}) {
  const spaceKey = space.key;
  const { t } = useTranslation("common");
  const { item } = card;
  const path = cardPath(card, spaceKey);
  const title = cardTitle(card);
  // The same lane the composer writes into: its artifact panel is where a row
  // can put something for you to look at.
  const hostKey = useMemo(
    () =>
      item.kind === "desk"
        ? agentDeskHostKey(space.id, item.agent.id)
        : card.threadId
          ? agentRoomHostKey(space.id, card.threadId)
          : null,
    [card.threadId, item, space.id]
  );
  const conversationTarget = `${path}${spaceConversationSearch({
    kind: item.kind,
    threadId: card.threadId,
  })}`;
  const needsVerdict = card.state === "waiting" || card.state === "paused";
  // The composer belongs to a pinned card. Waiting used to hide it so a
  // verdict button could stand alone; writing the reply on the card is the
  // same action, and the quieter place to do it.
  //
  // A desk needs no thread for this: writing to an agent nobody has spoken to
  // yet is exactly when the composer earns its place, and the desk creates the
  // thread on the first message. A room or a DM IS its thread.
  const showComposer =
    card.pinned && (item.kind === "desk" || Boolean(card.threadId));

  const subtitle =
    item.kind === "room"
      ? item.room.members
          .map(
            (member) => rosterById.get(member.agent_id)?.name ?? member.agent_id
          )
          .join(", ")
      : item.kind === "dm"
        ? t("spaces.home.cards.dmSubtitle", { defaultValue: "Direct message" })
        : item.agent.description?.trim() ||
          item.agent.reportsToName ||
          undefined;

  return (
    <section
      className={cn(
        "@container ui-card-raised ui-card-interactive group relative flex cursor-pointer items-start gap-3.5 rounded-[14px] px-4 py-3.5",
        needsVerdict ? "border-amber-500/40" : null
      )}
      data-state={card.state}
      data-testid={`space-home-card-${item.key}`}
    >
      <Link
        aria-label={title}
        className="absolute inset-0 z-0 rounded-[14px]"
        to={path}
      />
      {/* The engenty is a column of its own; the title, what it said, its jobs
          and its composer all start at ONE left edge beside it. Clicks on the
          face of the card open the conversation; controls below opt back in. */}
      <div className="pointer-events-none relative z-10 shrink-0 pt-0.5">
        {item.kind === "room" ? (
          <EngentyCluster
            kinds={item.room.members.map(
              (member) => rosterById.get(member.agent_id)?.engenty ?? "round"
            )}
            size={38}
          />
        ) : (
          <AgentFace
            avatarUrl={item.agent?.avatarUrl}
            kind={
              item.kind === "desk"
                ? item.agent.engenty
                : (item.agent?.engenty ?? "round")
            }
            name={
              item.kind === "desk"
                ? item.agent.name
                : (item.agent?.name ?? undefined)
            }
            size={38}
          />
        )}
      </div>

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-3">
        {/* Only the TITLE line makes room for the time and the badge. The
            description runs the full width beneath them — a long badge used to
            eat into it and re-wrap the text, which made cards of the same
            engenty look different depending on what it happened to be doing. */}
        <header className="flex min-w-0 flex-col gap-0.5">
          <div className="flex @min-[22rem]:flex-row flex-col items-start @min-[22rem]:items-center @min-[22rem]:gap-3 gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-[15px]">
              <span className="truncate group-hover:underline">{title}</span>
              {card.pinned ? (
                <span
                  aria-label={t("spaces.conversations.pin", {
                    defaultValue: "Pin",
                  })}
                  className="shrink-0 text-amber-500"
                  role="img"
                >
                  ★
                </span>
              ) : null}
              {item.kind === "dm" ? (
                <Lock
                  aria-hidden
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
            </div>
            {/* When it last moved, then what state it is in. The time dates the
                message below, but naming that below it only repeated a name
                already in the title, so the date comes up here on its own. */}
            <div className="flex shrink-0 items-center gap-2">
              {item.kind === "desk" ? (
                <AgentAttentionPill
                  agentId={item.agent.id}
                  agentName={item.agent.name}
                  count={attentionCount}
                />
              ) : null}
              {card.lastMessage ? (
                <span className="text-[12px] text-muted-foreground leading-none">
                  {formatRelativeDate(card.lastMessage.at)}
                </span>
              ) : null}
              <StateBadge card={card} />
            </div>
          </div>
          {/* What this engenty is FOR, in its own words — two lines, so
              the card stays a glance and the last message still has room. */}
          {subtitle ? (
            <p
              className="line-clamp-2 text-muted-foreground text-xs leading-relaxed"
              title={subtitle}
            >
              {subtitle}
            </p>
          ) : null}
        </header>

        {/* The words in a bubble, like the chat they came from. The jobs below
            are what to DO; this is what was last SAID. Yours sits right and
            tinted, the way it does in the conversation itself.

            It stops short of the card's right edge, and the composer stops at
            the same place: the title and the description run the card's full
            width, the chat blocks sit inside them — the way a message sits
            inside a conversation rather than filling the window. */}
        {card.lastMessage ? (
          <div
            className={cn(
              "min-w-0 px-3 py-2",
              CHAT_BLOCK_INSET,
              card.lastMessage.role === "user"
                ? "ml-auto max-w-[min(100%,28rem)] rounded-2xl bg-primary/10"
                : "rounded-2xl bg-muted/70"
            )}
          >
            {/* The clamp lives INSIDE the padding: on the padded box itself
                the hidden overflow starts below the padding, and the third
                line showed through it as a sliver. */}
            <p
              className={cn(
                "line-clamp-2 text-[13px] leading-relaxed",
                card.lastMessage.role === "user"
                  ? "text-foreground"
                  : "text-foreground/90"
              )}
            >
              {card.lastMessage.excerpt}
            </p>
          </div>
        ) : null}

        {card.jobs.length > 0 || card.doneCount > 0 ? (
          <div className="flex flex-col">
            {card.jobs.map((job, index) => (
              <SpaceHomeJobRow
                agentTurns={card.agentTurns}
                conversationTarget={conversationTarget}
                first={index === 0}
                hideAnswer={showComposer}
                hostKey={hostKey}
                job={job}
                key={`${job.app_release?.app_id ?? job.run_id ?? job.state}-${index}`}
                path={path}
                threadId={card.threadId}
              />
            ))}
            {card.hiddenJobs > 0 ? (
              <p className="border-border-soft border-t py-2.5 text-[12.5px] text-muted-foreground">
                {t("spaces.home.cards.moreJobs", {
                  count: card.hiddenJobs,
                  defaultValue: "{{count}} more running here",
                })}
              </p>
            ) : null}
            {/* One line for everything that ENDED, however many runs it was:
                the count is the news, each individual run is not. */}
            {card.doneCount > 0 ? (
              <p
                className={cn(
                  "py-2.5 text-[12.5px] text-muted-foreground",
                  card.jobs.length > 0 || card.hiddenJobs > 0
                    ? "border-border-soft border-t"
                    : null
                )}
              >
                {t("spaces.home.cards.doneCount", {
                  count: card.doneCount,
                  defaultValue: "{{count}} finished since your last visit",
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {showComposer ? (
          <div className={cn("pointer-events-auto", CHAT_BLOCK_INSET)}>
            <SpaceHomeComposer
              {...(item.kind === "desk" ? { agentId: item.agent.id } : {})}
              agentName={title}
              kind={item.kind}
              space={space}
              target={path}
              threadId={card.threadId}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
