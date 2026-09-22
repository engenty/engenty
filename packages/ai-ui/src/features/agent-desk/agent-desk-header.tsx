// The agent's identity as the page header: engenty, name, how far the open
// conversation is visible, mandate, module, and where it stands in the team.
//
// This block used to live inside the chat, as the empty state's landing card —
// so it vanished the moment you sent a message. Who this agent is does not
// depend on how long you have talked to it, so it is the identity at the top
// of the transcript and scrolls with it. A band in the topbar row names the
// desk once that block has scrolled away — it does not replace the large
// block in flow (that swap used to jitter the scroller).
//
// The visibility tier is the one fact both states must state. In flow it is
// the chip beside the readers line, on the page canvas — no ground of its own,
// so the identity reads as one block with the transcript. Scrolled, the chip
// grows into the band: the tier's ground under the topbar row (a private chat
// flips the theme, protected is the ember tint, open the page surface), the
// chip and the readers line on it, one line, and a status dot. Mandate,
// module and standing stay in the block — the band says who reads, nothing
// else. It is opaque: nothing scrolling underneath shows through.
//
// The only other pill is the module a module agent ships with, after the
// mandate: "Specialist" and "Custom" said nothing the name and the mandate do
// not, and sitting above the title they read as the loudest thing in the block.
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { BlobAvatar, cn, DetailPageHeader } from "@engenty/ui-core";
import { CornerDownRight, Crown, Users } from "lucide-react";
import { useOptionalAgentHostByKey } from "../../agent-provider/engenty-agent.js";
import { AgentFace } from "../../components/agent-face.js";
import type { ChatKind } from "../../components/copilot/chat-kind-badge.js";
import {
  type ChatVisibility,
  ChatVisibilityBand,
  ChatVisibilityChip,
  useChatVisibilityCopy,
} from "../../components/copilot/chat-visibility.js";
import { AgentModuleBadge } from "../agents-workspace/agent-badges.js";

/** Where the agent stands in the Space's team, by display name. */
export interface AgentDeskRelation {
  /** A hired engenty whose mount names no manager — it may hire and set up. */
  coordinator: boolean;
  /** The colleagues that report to this agent. */
  reportNames: readonly string[];
  /** Who this agent reports to. */
  reportsToName?: string | null;
}

export interface AgentDeskHeaderProps {
  agent: AgentDeskAgent;
  /** What the open conversation is; absent while no thread is bound. */
  chatKind?: ChatKind | null;
  collapsed: boolean;
  /** The host the chat runs under — the compact row's status dot reads it. */
  hostKey?: string;
  /** When the open conversation last moved — the band's right edge. */
  lastActivityAt?: string | null;
  /** Protected: how many people read along. */
  memberCount?: number | null;
  /** Display name of `agent.managed_by_module`, as the sidebar labels it. */
  moduleLabel?: string;
  relation?: AgentDeskRelation | null;
  spaceName?: string | null;
  /** How far the open conversation is visible; absent while no thread is bound. */
  visibility?: ChatVisibility | null;
}

function RelationLine({
  className,
  relation,
}: {
  className?: string;
  relation: AgentDeskRelation | null | undefined;
}) {
  const { t } = useTranslation("ai-ui");
  if (!relation) {
    return null;
  }
  // Standing is colour-coded the way the rest of the desk codes it: amber for
  // "answers to nobody", sky for a reporting line either way.
  const lines: { icon: typeof Crown; iconClass: string; text: string }[] = [];
  if (relation.reportsToName) {
    lines.push({
      icon: CornerDownRight,
      iconClass: "text-sky-600 dark:text-sky-400",
      text: `${t("agentDesk.reportsTo")} ${relation.reportsToName}`,
    });
  } else if (relation.coordinator) {
    lines.push({
      icon: Crown,
      iconClass: "text-amber-600 dark:text-amber-400",
      text: t("agentDesk.relation.coordinator"),
    });
  }
  if (relation.reportNames.length > 0) {
    lines.push({
      icon: Users,
      iconClass: "text-sky-600 dark:text-sky-400",
      text: t("agentDesk.relation.reports", {
        names: relation.reportNames.join(", "),
      }),
    });
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs",
        className
      )}
    >
      {lines.map(({ icon: Icon, iconClass, text }) => (
        <span className="inline-flex items-center gap-1" key={text}>
          <Icon aria-hidden className={cn("size-3", iconClass)} />
          {text}
        </span>
      ))}
    </div>
  );
}

/** A dot the colour of the run: working, waiting on someone, idle. */
function StatusDot({ hostKey }: { hostKey?: string }) {
  const { t } = useTranslation("ai-ui");
  const host = useOptionalAgentHostByKey(hostKey);
  if (!host) {
    return null;
  }
  const working = host.status === "streaming" || host.status === "submitted";
  const waiting = host.awaitingInterrupt;
  const label = working
    ? t("agentDesk.status.working")
    : waiting
      ? t("agentDesk.status.waiting")
      : t("agentDesk.status.idle");
  return (
    <span
      aria-label={label}
      className={cn(
        "size-2 shrink-0 rounded-full",
        working
          ? "animate-pulse bg-primary"
          : waiting
            ? "bg-amber-500"
            : "bg-emerald-500/70"
      )}
      role="img"
      title={label}
    />
  );
}

/**
 * A private line names the agent — "only you and X"; the other tiers do not.
 * The copilot's is "only you": it is the person's own, not a line to someone.
 */
function readersName(props: AgentDeskHeaderProps): string | undefined {
  return props.visibility === "private" && props.chatKind !== "copilot"
    ? props.agent.name
    : undefined;
}

function CompactHeader(props: AgentDeskHeaderProps) {
  if (!props.visibility) {
    // No conversation bound: nothing to say about who reads, so the band is
    // only the ground the topbar floats on.
    return (
      <header
        className="pointer-events-auto w-full shrink-0 border-border-soft border-b bg-background"
        data-collapsed="true"
      >
        <div aria-hidden className="h-11" />
      </header>
    );
  }
  return (
    // `pl-5` = the transcript's own gutter (`px-3` on the scroller plus
    // `pl-2` on the stack), so the band's info starts on the message edge.
    <ChatVisibilityBand
      kind={props.chatKind}
      lastActivityAt={props.lastActivityAt}
      memberCount={props.memberCount}
      name={readersName(props)}
      spaceName={props.spaceName}
      visibility={props.visibility}
    >
      <StatusDot hostKey={props.hostKey} />
    </ChatVisibilityBand>
  );
}

function VisibilityLine(props: AgentDeskHeaderProps) {
  const copy = useChatVisibilityCopy({
    memberCount: props.memberCount,
    name: readersName(props),
    spaceName: props.spaceName,
    visibility: props.visibility ?? "open",
  });
  if (!props.visibility) {
    return null;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      data-testid="agent-desk-readers-bar"
    >
      <ChatVisibilityChip
        kind={props.chatKind}
        memberCount={props.memberCount}
        name={readersName(props)}
        spaceName={props.spaceName}
        visibility={props.visibility}
      />
      {/* Open is the default: the chip says it, a sentence would repeat it. */}
      {props.visibility === "open" ? null : (
        <span className="min-w-0 text-muted-foreground text-xs">
          {copy.readers}
        </span>
      )}
    </div>
  );
}

export function AgentDeskHeader(props: AgentDeskHeaderProps) {
  const { t } = useTranslation("ai-ui");
  const { agent, moduleLabel, relation } = props;
  const description = agent.description?.trim() ?? "";

  if (props.collapsed) {
    return <CompactHeader {...props} />;
  }

  return (
    // No column of its own: the header is the transcript's first row, so it
    // already sits in the lane (`CHAT_LANE_TRANSCRIPT_CLASS`). Name, mandate
    // and every message below share one left edge — a second centred `max-w`
    // here only pushed the identity off that edge.
    <div className="relative w-full shrink-0 pt-20 pb-4">
      {/* The engenty hangs in the margin beside the lane, so it does not
          indent the name out of the message column. That margin is the lane
          box (`@container/chat-lane`), not the window: a wide viewport with
          the space column and an end pane open is still too narrow, and the
          mark was clipping on the column edge. 54rem is the 42rem lane plus
          5.5rem of overhang each side, with a little air so the face stays
          inside the scrollport. Narrower, it stands above the name. */}
      <span
        aria-label={t("agentDesk.engentyLabel", { name: agent.engenty })}
        className="mb-2 block @min-[54rem]/chat-lane:absolute @min-[54rem]/chat-lane:top-20 @min-[54rem]/chat-lane:-left-[5.5rem] @min-[54rem]/chat-lane:mb-0"
        role="img"
      >
        {agent.role === "copilot" ? (
          // The copilot is the blob from the app bar, not an engenty.
          <BlobAvatar
            character="ember"
            className="[&_.blob-shadow]:hidden"
            size={56}
          />
        ) : (
          <AgentFace
            avatarUrl={agent.avatarUrl}
            kind={agent.engenty}
            name={agent.name}
            size={60}
          />
        )}
      </span>
      <DetailPageHeader
        containerClassName="max-w-none px-0 pt-0 pb-0 sm:px-0 md:px-0 md:pb-0"
        description={
          <div className="max-w-2xl space-y-1.5">
            {/* Who reads along comes first, right under the name: it is the
                fact the band will keep stating once this has scrolled away. */}
            <VisibilityLine {...props} />
            {description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            ) : null}
            {agent.source === "module" && agent.managed_by_module ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <AgentModuleBadge
                  label={moduleLabel}
                  moduleId={agent.managed_by_module}
                />
              </div>
            ) : null}
            <RelationLine relation={relation} />
          </div>
        }
        // Never collapsed here, so the clamp only ever clipped: on a phone the
        // chip, the mandate and the standing line run past 8rem.
        descriptionClassName="max-h-none"
        // Wraps rather than truncates — the name owns the whole measure now.
        title={<span className="break-words">{agent.name}</span>}
        // No card surface: the identity reads on the page canvas, the same
        // treatment the Agents roster gives its own header.
        variant="canvas"
      />
    </div>
  );
}
