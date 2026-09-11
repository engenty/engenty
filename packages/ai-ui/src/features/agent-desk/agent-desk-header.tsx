// The agent's identity as the page header: engenty, name, module, mandate.
//
// This block used to live inside the chat, as the empty state's landing card —
// so it vanished the moment you sent a message. Who this agent is does not
// depend on how long you have talked to it, so it is the header. Once the chat
// scrolls it shrinks to an EMPTY band the height of the floating topbar: the
// breadcrumb already names the agent (engenty, name, switcher), so an ongoing
// chat gets a toolbar, not a card. Skills and connectors are settings, not
// identity; they live in the drawer.
//
// The only pill is the module a module agent ships with, after the name:
// "Specialist" and "Custom" said nothing the name and the mandate do not, and
// sitting above the title they read as the loudest thing in the block.
import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { DetailPageHeader, Engenty } from "@engenty/ui-core";
import { CornerDownRight } from "lucide-react";
import {
  THREAD_CONTEXT_FLOAT_RESERVE_PX,
  useThreadContextUi,
} from "../../components/copilot/thread-context/index.js";
import { AgentModuleBadge } from "../agents-workspace/agent-badges.js";

export function AgentDeskHeader({
  agent,
  collapsed,
  moduleLabel,
  reportsToName,
}: {
  agent: AgentDeskAgent;
  collapsed: boolean;
  /** Display name of `agent.managed_by_module`, as the sidebar labels it. */
  moduleLabel?: string;
  /** Who this agent reports to in this space, by name. */
  reportsToName?: string;
}) {
  const { t } = useTranslation("ai-ui");
  const description = agent.description?.trim() ?? "";
  // The floating thread-context card takes a lane out of the chat's right
  // side. It publishes that reserve as a CSS variable, but only inside the
  // pane it wraps — and this header is a sibling ABOVE that pane, so the
  // variable never reaches it and the name stayed centred while every message
  // shifted left. Same reserve, read from the store the pane writes.
  const { mode: threadContextMode } = useThreadContextUi();
  const floatReservePx =
    threadContextMode === "inline" ? THREAD_CONTEXT_FLOAT_RESERVE_PX : 0;

  if (collapsed) {
    // Same height as the transparent topbar (h-11) that floats over it: the
    // band is the clearance the breadcrumb and action row sit in, nothing
    // more — no surface of its own, like the expanded header.
    return <header className="h-11 w-full shrink-0" />;
  }

  return (
    <div
      className="w-full shrink-0"
      style={floatReservePx ? { paddingRight: floatReservePx } : undefined}
    >
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
          description || reportsToName ? (
            <div className="max-w-xl space-y-1.5">
              {description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {description}
                </p>
              ) : null}
              {reportsToName ? (
                <p className="flex items-center gap-1 text-muted-foreground text-xs">
                  <CornerDownRight className="size-3" />
                  {t("agentDesk.reportsTo")}
                  <span className="text-foreground">{reportsToName}</span>
                </p>
              ) : null}
            </div>
          ) : null
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
          agent.source === "module" && agent.managed_by_module ? (
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0">{agent.name}</span>
              <AgentModuleBadge
                label={moduleLabel}
                moduleId={agent.managed_by_module}
              />
            </span>
          ) : (
            agent.name
          )
        }
        // No card surface: the identity reads on the page canvas, the same
        // treatment the Agents roster gives its own header.
        variant="canvas"
      />
    </div>
  );
}
