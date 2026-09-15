// The agent's identity as the page header: engenty, name, module, mandate,
// where it stands in the team, and what kind of conversation is open.
//
// This block used to live inside the chat, as the empty state's landing card —
// so it vanished the moment you sent a message. Who this agent is does not
// depend on how long you have talked to it, so it is the identity at the top
// of the transcript and scrolls with it. A compact overlay in the topbar band
// names the desk once that block has scrolled away — it does not replace the
// large block in flow (that swap used to jitter the scroller).
//
// The only pill is the module a module agent ships with, after the name:
// "Specialist" and "Custom" said nothing the name and the mandate do not, and
// sitting above the title they read as the loudest thing in the block.
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, DetailPageHeader, Engenty } from "@engenty/ui-core";
import { CornerDownRight, Crown, Users } from "lucide-react";
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
  relation?: AgentDeskRelation | null;
  spaceName?: string | null;
}

function RelationLine({
  relation,
}: {
  relation: AgentDeskRelation | null | undefined;
}) {
  const { t } = useTranslation("ai-ui");
  if (!relation) {
    return null;
  }
  const lines: { icon: typeof Crown; text: string }[] = [];
  if (relation.reportsToName) {
    lines.push({
      icon: CornerDownRight,
      text: `${t("agentDesk.reportsTo")} ${relation.reportsToName}`,
    });
  } else if (relation.coordinator) {
    lines.push({ icon: Crown, text: t("agentDesk.relation.coordinator") });
  }
  if (relation.reportNames.length > 0) {
    lines.push({
      icon: Users,
      text: t("agentDesk.relation.reports", {
        names: relation.reportNames.join(", "),
      }),
    });
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {lines.map(({ icon: Icon, text }) => (
        <span className="inline-flex items-center gap-1" key={text}>
          <Icon aria-hidden className="size-3" />
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
  const { t } = useTranslation("ai-ui");
  const { agent } = props;
  // Same height as the transparent topbar (h-11) that floats over it: the
  // breadcrumb sits left, the actions right — this row is centred between
  // them and steps aside on narrow screens, where the breadcrumb already
  // names the agent.
  return (
    <header className="relative h-11 w-full shrink-0" data-collapsed="true">
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
        <div className="pointer-events-auto flex min-w-0 max-w-[50%] items-center gap-2 rounded-full border border-border-soft bg-background/80 px-2.5 py-1 shadow-xs backdrop-blur">
          <span
            aria-label={t("agentDesk.engentyLabel", { name: agent.engenty })}
            role="img"
          >
            <Engenty
              className="[&_.e-shadow]:hidden"
              kind={agent.engenty}
              size={24}
            />
          </span>
          <span className="min-w-0 truncate font-medium text-sm">
            {agent.name}
          </span>
          {props.chatKind ? (
            <ChatKindBadge
              kind={props.chatKind}
              memberCount={props.memberCount}
              name={agent.name}
              spaceName={props.spaceName}
            />
          ) : null}
          <StatusDot hostKey={props.hostKey} />
        </div>
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
    <div className="w-full shrink-0">
      <DetailPageHeader
        // The chat's own gutter, so the identity column can be centred inside
        // exactly the space the transcript is centred in.
        className="px-3"
        // Same column as the chat: `max-w-[42rem]`, centred, no gutter of its
        // own (the root carries it) — otherwise the name starts left of every
        // message. `pb-4` because there is no strip under the title to space it.
        // `pt-20` rather than the variant's `pt-14`: the extra clearance keeps
        // the name off the floating topbar instead of just below it.
        containerClassName="max-w-[42rem] px-0 pt-20 pb-4 sm:px-0 md:px-0 md:pb-4"
        description={
          <div className="max-w-xl space-y-1.5">
            {description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            ) : null}
            <RelationLine relation={relation} />
          </div>
        }
        maxWidth="5xl"
        media={
          <span
            aria-label={t("agentDesk.engentyLabel", { name: agent.engenty })}
            role="img"
          >
            <Engenty kind={agent.engenty} size={60} />
          </span>
        }
        title={
          <span className="flex min-w-0 flex-nowrap items-center gap-1.5">
            <span className="min-w-0 truncate">{agent.name}</span>
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
          </span>
        }
        // No card surface: the identity reads on the page canvas, the same
        // treatment the Agents roster gives its own header.
        variant="canvas"
      />
    </div>
  );
}
