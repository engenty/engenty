// The agent's identity as the page header: engenty, name, module, mandate,
// where it stands in the team, and what kind of conversation is open.
//
// This block used to live inside the chat, as the empty state's landing card —
// so it vanished the moment you sent a message. Who this agent is does not
// depend on how long you have talked to it, so it is the identity at the top
// of the transcript and scrolls with it. A compact band in the topbar row
// names the desk once that block has scrolled away — it does not replace the
// large block in flow (that swap used to jitter the scroller). The band is
// two lines and opaque: name on the first, kind / readers / standing on the
// second, and nothing scrolling underneath shows through it.
//
// The only pill is the module a module agent ships with, after the name:
// "Specialist" and "Custom" said nothing the name and the mandate do not, and
// sitting above the title they read as the loudest thing in the block.
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, DetailPageHeader, Engenty } from "@engenty/ui-core";
import { CornerDownRight, Crown, Lock, Users } from "lucide-react";
import { useOptionalAgentHostByKey } from "../../agent-provider/engenty-agent.js";
import {
  type ChatKind,
  ChatKindBadge,
} from "../../components/copilot/chat-kind-badge.js";
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

/** Who reads the open conversation, as the header states it. */
export interface AgentDeskReaders {
  kind: "dm" | "shared";
  text: string;
}

export interface AgentDeskHeaderProps {
  agent: AgentDeskAgent;
  /** What the open conversation is; absent while no thread is bound. */
  chatKind?: ChatKind | null;
  collapsed: boolean;
  /** The host the chat runs under — the compact row's status dot reads it. */
  hostKey?: string;
  /** Rooms: how many members. */
  memberCount?: number | null;
  /** Display name of `agent.managed_by_module`, as the sidebar labels it. */
  moduleLabel?: string;
  readers?: AgentDeskReaders | null;
  relation?: AgentDeskRelation | null;
  spaceName?: string | null;
}

function ReadersLine({ readers }: { readers: AgentDeskReaders | null }) {
  if (!readers) {
    return null;
  }
  const Icon = readers.kind === "dm" ? Lock : Users;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1 text-muted-foreground text-xs"
      data-testid={
        readers.kind === "dm" ? "agent-desk-dm-bar" : "agent-desk-readers-bar"
      }
    >
      <Icon
        aria-hidden
        className={cn(
          "size-3 shrink-0",
          // Same colour the kind badge uses for the same fact: locked to you
          // is amber, a Space that reads along is teal.
          readers.kind === "dm"
            ? "text-amber-600 dark:text-amber-400"
            : "text-teal-600 dark:text-teal-400"
        )}
      />
      <span className="min-w-0 truncate">{readers.text}</span>
    </span>
  );
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

function CompactHeader(props: AgentDeskHeaderProps) {
  const { agent } = props;
  // Two lines, opaque, UNDER the transparent topbar (z-10 against its z-20).
  // The first line is the topbar's own row — breadcrumb left, actions right
  // — so this only paints the ground it floats on. The second carries what
  // the large block said under the name: the conversation's kind, who reads
  // it, where the agent stands, and whether it is working. Steps aside on
  // narrow screens, where the topbar already fills the band.
  return (
    <header
      className="pointer-events-auto hidden w-full shrink-0 border-border-soft border-b bg-background md:block"
      data-collapsed="true"
    >
      <div aria-hidden className="h-11" />
      <div
        // `pl-5` = the transcript's own gutter (`px-3` on the scroller plus
        // `pl-2` on the stack), so the band's info starts on the message edge.
        className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-3 pb-2 pl-5 text-muted-foreground text-xs"
      >
        {agent.source === "module" && agent.managed_by_module ? (
          <AgentModuleBadge
            label={props.moduleLabel}
            moduleId={agent.managed_by_module}
          />
        ) : null}
        {props.chatKind ? (
          <ChatKindBadge
            kind={props.chatKind}
            memberCount={props.memberCount}
            name={agent.name}
            spaceName={props.spaceName}
          />
        ) : null}
        <ReadersLine readers={props.readers ?? null} />
        <RelationLine className="contents" relation={props.relation} />
        <StatusDot hostKey={props.hostKey} />
      </div>
    </header>
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
          indent the name out of the message column. That margin only exists
          on a wide window; below `xl` it stands above the name instead. */}
      <span
        aria-label={t("agentDesk.engentyLabel", { name: agent.engenty })}
        className="mb-2 block xl:absolute xl:top-20 xl:left-[-5.5rem] xl:mb-0"
        role="img"
      >
        <Engenty kind={agent.engenty} size={60} />
      </span>
      <DetailPageHeader
        containerClassName="max-w-none px-0 pt-0 pb-0 sm:px-0 md:px-0 md:pb-0"
        description={
          <div className="max-w-2xl space-y-1.5">
            {description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            ) : null}
            {/* The badges read with the standing lines, not with the name:
                beside a long name they hung off the end of the title. */}
            <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
              {agent.source === "module" && agent.managed_by_module ? (
                <AgentModuleBadge
                  label={moduleLabel}
                  moduleId={agent.managed_by_module}
                />
              ) : null}
              {props.chatKind ? (
                <ChatKindBadge
                  kind={props.chatKind}
                  memberCount={props.memberCount}
                  name={agent.name}
                  spaceName={props.spaceName}
                />
              ) : null}
            </div>
            <RelationLine relation={relation} />
            <ReadersLine readers={props.readers ?? null} />
          </div>
        }
        // Wraps rather than truncates — the name owns the whole measure now.
        title={<span className="break-words">{agent.name}</span>}
        // No card surface: the identity reads on the page canvas, the same
        // treatment the Agents roster gives its own header.
        variant="canvas"
      />
    </div>
  );
}
