"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { type ReactNode, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ENGENTY_COPILOT_HOST_KEY } from "../../agent-provider/host-keys.js";
import { ChatCommandsHelpDialog } from "../../components/copilot/composer/chat-commands-help-dialog.js";
import type { ChatSlashCommand } from "../../components/copilot/composer/copilot-slash-command.js";
import { PromptPreviewDialog } from "../../components/copilot/context-usage/prompt-preview-dialog.js";
import { ThreadUsageDialog } from "../../components/copilot/context-usage/thread-usage-dialog.js";
import { copilotRiverPathForPathname } from "../../copilot/copilot-river-paths.js";
import {
  HOST_MESSAGE_HANDOFF_STATE,
  writePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import {
  useCompactThreadMutation,
  useThreadChaptersQuery,
} from "../../copilot/thread-chapters-api.js";
import { useChatSlashCommands } from "../../hooks/use-chat-slash-commands.js";
import {
  baseChatModePick,
  chatModeDraftKey,
  readChatModeDraft,
  setChatModeDraft,
} from "../ai-effort/chat-mode-store.js";
import type { AgentDeskPanel } from "./agent-desk-drawer.js";

const SLASH_CHAT_MODES = ["normal", "extra"] as const;

function isSlashChatMode(
  value: string
): value is (typeof SLASH_CHAT_MODES)[number] {
  return (SLASH_CHAT_MODES as readonly string[]).includes(
    value.trim().toLowerCase()
  );
}

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
 * - `/chapter` closes the chapter: the same cut as "New chapter" in the
 *   history, only where the thread has chapters (the river, a desk line, a
 *   DM). The transcript folds what came before it.
 * - `/effort normal|extra` sets this chat's pick, like the composer's pill.
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
  /**
   * The lane's host — `/effort` sets the pick of its chat. Without one (and
   * no thread yet) there is no chat to set it on, and `/effort` is absent.
   */
  hostKey?: string;
  onOpenPanel?: (panel: AgentDeskPanel) => void;
  skillIds: string[];
  spaceId: string | null;
  threadId: string | null;
}): { dialogs: ReactNode; slashCommands: ChatSlashCommand[] } {
  const { t } = useTranslation("ai-ui");
  const [dialog, setDialog] = useState<"context" | "help" | "usage" | null>(
    null
  );
  const { agentSwitch, hostKey, onOpenPanel, threadId } = input;
  const navigate = useNavigate();
  const location = useLocation();
  // Chapters answer only for a thread that has them; the list is the probe.
  const chaptered = useThreadChaptersQuery(threadId).isSuccess;
  const cutChapter = useCompactThreadMutation(threadId);
  const cutChapterPending = cutChapter.isPending;
  const cutChapterNow = cutChapter.mutate;
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
        run: () => setDialog("help"),
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
      if (chaptered) {
        commands.push({
          command: "chapter",
          description: t("agentDesk.commands.chapter"),
          group: "Core",
          kind: "ui",
          run: () => {
            if (!cutChapterPending) {
              cutChapterNow();
            }
          },
        });
      }
    }
    // Normal / Extra only: Custom needs a model, which is what the flyout is
    // for. The pick is this chat's, like the composer's.
    const effortKey =
      threadId || hostKey ? chatModeDraftKey(hostKey ?? "", threadId) : null;
    if (effortKey) {
      commands.push({
        accepts: (argsText) => isSlashChatMode(argsText),
        argsHint: `<${SLASH_CHAT_MODES.join("|")}>`,
        command: "effort",
        description: t("agentDesk.commands.effort"),
        group: "Core",
        kind: "ui",
        run: (argsText) => {
          const mode = argsText.trim().toLowerCase();
          if (isSlashChatMode(mode)) {
            setChatModeDraft(effortKey, {
              ...(readChatModeDraft(effortKey)?.pick ?? baseChatModePick()),
              mode,
            });
          }
        },
      });
    }
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
  }, [
    agentSwitch,
    chaptered,
    cutChapterNow,
    cutChapterPending,
    hostKey,
    onOpenPanel,
    openCopilot,
    t,
    threadId,
  ]);

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
  const dialogs = (
    <>
      <ChatCommandsHelpDialog
        commands={slashCommands}
        onOpenChange={close}
        open={dialog === "help"}
      />
      {threadId ? (
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
      ) : null}
    </>
  );

  return { dialogs, slashCommands };
}
