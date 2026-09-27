"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { type ReactNode, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ENGENTY_COPILOT_HOST_KEY } from "../../agent-provider/host-keys.js";
import type { ChatSlashCommand } from "../../components/copilot/composer/copilot-slash-command.js";
import { PromptPreviewDialog } from "../../components/copilot/context-usage/prompt-preview-dialog.js";
import { ThreadUsageDialog } from "../../components/copilot/context-usage/thread-usage-dialog.js";
import { copilotRiverPathForPathname } from "../../copilot/copilot-river-paths.js";
import {
  HOST_MESSAGE_HANDOFF_STATE,
  writePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import { useChatSlashCommands } from "../../hooks/use-chat-slash-commands.js";
import { AI_EFFORT_CHOICES } from "../ai-effort/effort-choices.js";
import {
  isEffortChoice,
  setChatEffortChoice,
} from "../ai-effort/use-chat-effort-choice.js";
import type { AgentDeskPanel } from "./agent-desk-drawer.js";

/** Another agent of the Space, as `/agent` finds it by name. */
export interface AgentDeskSlashAgent {
  id: string;
  name: string;
}

/** The Space's other agents and how to open one's desk. */
export interface AgentDeskSlashAgentSwitch {
  agents: readonly AgentDeskSlashAgent[];
  open: (agentId: string) => void;
}

/**
 * The agent a typed name points at: its id or full name, else the one name
 * that starts with it, else the one that contains it. Null when none or
 * several match — `/agent` then keeps the draft instead of guessing.
 */
export function matchDeskAgent(
  agents: readonly AgentDeskSlashAgent[],
  typed: string
): AgentDeskSlashAgent | null {
  const needle = typed.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  const exact = agents.find(
    (agent) =>
      agent.id.toLowerCase() === needle || agent.name.toLowerCase() === needle
  );
  if (exact) {
    return exact;
  }
  for (const test of [
    (name: string) => name.startsWith(needle),
    (name: string) => name.includes(needle),
  ]) {
    const hits = agents.filter((agent) => test(agent.name.toLowerCase()));
    if (hits.length === 1) {
      return hits[0] ?? null;
    }
    if (hits.length > 1) {
      return null;
    }
  }
  return null;
}

/**
 * The desk's `/` catalog: the core built-ins that run here without a message,
 * then this agent's server commands and skills.
 *
 * - `/settings`, `/runs` open the desk's own pane — only where a desk frame
 *   hosts it (`onOpenPanel`); the drawer and a room have none.
 * - `/context`, `/usage` open the same dialogs the composer's usage meter
 *   does, for the bound thread — a chat not yet sent has neither.
 * - `/effort <level>` sets the same pick as the composer's effort pill.
 * - `/agent <name>` (also `/engenty`, `/bot`) is a Space desk's: another
 *   agent's desk.
 * - `/copilot [message]` opens the copilot, sending the message there.
 *
 * `/schedule`, `/remember` and `/learn` are server prompt commands (apps/ai
 * chat-commands.ts): the agent does them with its own tools.
 */
export function useAgentDeskSlashCommands(input: {
  agentId: string;
  /** "personal" on the copilot's own desk, which gets no `/copilot`. */
  agentScope?: string | null;
  /** The Space's other agents and how to open one's desk — `/agent`. */
  agentSwitch?: AgentDeskSlashAgentSwitch;
  onOpenPanel?: (panel: AgentDeskPanel) => void;
  skillIds: string[];
  spaceId: string | null;
  threadId: string | null;
}): { dialogs: ReactNode; slashCommands: ChatSlashCommand[] } {
  const { t } = useTranslation("ai-ui");
  const [dialog, setDialog] = useState<"context" | "usage" | null>(null);
  const { agentSwitch, onOpenPanel, threadId } = input;
  const navigate = useNavigate();
  const location = useLocation();
  // `/copilot [message]`: the person's copilot for the place they stand on,
  // the message handed over the way a module page's "ask the copilot" does.
  const onCopilotDesk = input.agentScope === "personal";
  const openCopilot = useMemo(() => {
    if (onCopilotDesk) {
      return null;
    }
    return (argsText: string) => {
      const message = argsText.trim();
      if (message) {
        writePendingHostMessage(ENGENTY_COPILOT_HOST_KEY, message);
      }
      navigate(
        copilotRiverPathForPathname(location.pathname),
        message ? { state: { [HOST_MESSAGE_HANDOFF_STATE]: message } } : {}
      );
    };
  }, [location.pathname, navigate, onCopilotDesk]);

  const builtins = useMemo<ChatSlashCommand[]>(() => {
    const commands: ChatSlashCommand[] = [
      {
        command: "help",
        description: t("agentDesk.commands.help"),
        group: "Core",
        kind: "ui",
      },
    ];
    if (onOpenPanel) {
      commands.push(
        {
          command: "settings",
          description: t("agentDesk.commands.settings"),
          group: "Core",
          kind: "ui",
          run: () => onOpenPanel("manage"),
        },
        {
          command: "runs",
          description: t("agentDesk.commands.runs"),
          group: "Core",
          kind: "ui",
          run: () => onOpenPanel("runs"),
        }
      );
    }
    if (threadId) {
      commands.push(
        {
          command: "context",
          description: t("agentDesk.commands.context"),
          group: "Core",
          kind: "ui",
          run: () => setDialog("context"),
        },
        {
          command: "usage",
          description: t("agentDesk.commands.usage"),
          group: "Core",
          kind: "ui",
          run: () => setDialog("usage"),
        }
      );
    }
    commands.push({
      accepts: (argsText) => isEffortChoice(argsText.trim().toLowerCase()),
      argsHint: `<${AI_EFFORT_CHOICES.join("|")}>`,
      command: "effort",
      description: t("agentDesk.commands.effort"),
      group: "Core",
      kind: "ui",
      run: (argsText) => {
        const choice = argsText.trim().toLowerCase();
        if (isEffortChoice(choice)) {
          setChatEffortChoice(choice);
        }
      },
    });
    if (agentSwitch && agentSwitch.agents.length > 0) {
      commands.push({
        accepts: (argsText) =>
          matchDeskAgent(agentSwitch.agents, argsText) !== null,
        aliases: ["engenty", "bot"],
        argsHint: "<name>",
        command: "agent",
        description: t("agentDesk.commands.agent"),
        group: "Core",
        kind: "ui",
        run: (argsText) => {
          const agent = matchDeskAgent(agentSwitch.agents, argsText);
          if (agent) {
            agentSwitch.open(agent.id);
          }
        },
      });
    }
    if (openCopilot) {
      commands.push({
        argsHint: "<message?>",
        command: "copilot",
        description: t("agentDesk.commands.copilot"),
        group: "Core",
        kind: "ui",
        run: (argsText) => openCopilot(argsText),
      });
    }
    return commands;
  }, [agentSwitch, onOpenPanel, openCopilot, t, threadId]);

  const slashCommands = useChatSlashCommands({
    agentId: input.agentId,
    builtins,
    skillIds: input.skillIds,
    spaceId: input.spaceId,
  });

  const close = (open: boolean) => {
    if (!open) {
      setDialog(null);
    }
  };
  const dialogs = threadId ? (
    <>
      <PromptPreviewDialog
        onOpenChange={close}
        open={dialog === "context"}
        threadId={threadId}
      />
      <ThreadUsageDialog
        onOpenChange={close}
        open={dialog === "usage"}
        threadId={threadId}
      />
    </>
  ) : null;

  return { dialogs, slashCommands };
}
