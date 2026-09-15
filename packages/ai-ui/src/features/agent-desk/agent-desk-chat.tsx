"use client";

import type {
  AgentDeskAgent,
  AgentDeskCapabilityChip,
  AgentDeskStarter,
} from "@engenty/ai-core/browser";
import type { ReactNode } from "react";
import { EngentyAgent } from "../../agent-provider/index.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { PendingHostMessageSubmit } from "../../copilot/pending-host-message-submit.js";
import { AgentDeskChatPanel } from "./agent-desk-chat-panel.js";
import { AgentDeskRosterRefresh } from "./agent-desk-roster-refresh.js";
import { agentDeskHostKey } from "./agent-desk-url.js";
import { useAgentDeskThread } from "./use-agent-desk-thread.js";

export function AgentDeskChat(props: {
  agentConnectors: AgentDeskCapabilityChip[];
  agentDescription: string | null;
  agentEngenty: AgentDeskAgent["engenty"];
  agentId: string;
  agentName: string;
  agentRole: AgentDeskAgent["role"];
  agentScope?: AgentDeskAgent["agentScope"];
  agentSkills: AgentDeskCapabilityChip[];
  agentStarters: AgentDeskStarter[];
  /** Composer control left of the attach (+) menu — the effort chooser. */
  composerLeadingControl?: ReactNode;
  composerPlaceholder?: string;
  /** Identity that scrolls with the transcript, not a block above it. */
  scrollHeader?: ReactNode;
  /** False when the surface around this chat lays the context card out itself. */
  contextPane?: boolean;
  /**
   * The host key this chat runs under. A desk's by default; a room passes its
   * own so its pane and drafts never share the host's desk.
   */
  hostKey?: string;
  /** `@` candidates — the Space's people and other agents, as references. */
  mentionRefSearch?: MentionRefSearch;
  onPendingConsumed?: () => void;
  onThreadCreated: (threadId: string) => void;
  /** The top of the transcript scrolled out of, or back into, view. */
  onTranscriptTopVisibility?: (visible: boolean) => void;
  pendingSubmit?: string | null;
  spaceId: string;
  starters?: boolean;
  threadId: string | null;
}) {
  const hostKey =
    props.hostKey ?? agentDeskHostKey(props.spaceId, props.agentId);
  const deskThread = useAgentDeskThread(hostKey, props.threadId);

  return (
    <EngentyAgent
      agentId={props.agentId}
      authoritativeUrlThreadId={props.threadId}
      hostKey={hostKey}
      hydrateEnabled
      initialMessages={deskThread.initialMessages}
      onThreadCreated={props.onThreadCreated}
      openInterruptFromSession={deskThread.openInterruptFromSession}
      routeContext={{
        moduleId: "agent-desk",
        routeKey: "agent-desk",
        scope: { space_id: props.spaceId },
      }}
      {...(deskThread.thread.threadDetailQueryKey.length > 0
        ? { threadDetailQueryKey: deskThread.thread.threadDetailQueryKey }
        : {})}
      {...(deskThread.thread.threadMessagesQueryKey.length > 0
        ? { messagesQueryKey: deskThread.thread.threadMessagesQueryKey }
        : {})}
      threadId={props.threadId}
    >
      <AgentDeskRosterRefresh />
      <PendingHostMessageSubmit
        hostKey={hostKey}
        isLoadingMessages={deskThread.isLoadingMessages}
        message={props.pendingSubmit ?? null}
        onConsumed={props.onPendingConsumed}
      />
      <AgentDeskChatPanel
        agentConnectors={props.agentConnectors}
        agentDescription={props.agentDescription}
        agentEngenty={props.agentEngenty}
        agentId={props.agentId}
        agentName={props.agentName}
        agentRole={props.agentRole}
        agentScope={props.agentScope}
        agentSkills={props.agentSkills}
        agentStarters={props.agentStarters}
        composerLeadingControl={props.composerLeadingControl}
        {...(props.composerPlaceholder
          ? { composerPlaceholder: props.composerPlaceholder }
          : {})}
        {...(props.contextPane === undefined
          ? {}
          : { contextPane: props.contextPane })}
        hostKey={hostKey}
        initialMessages={deskThread.initialMessages}
        isLoadingMessages={deskThread.isLoadingMessages}
        mentionRefSearch={props.mentionRefSearch}
        olderMessages={deskThread.olderMessages}
        onTranscriptTopVisibility={props.onTranscriptTopVisibility}
        openInterruptFromSession={deskThread.openInterruptFromSession}
        {...(props.scrollHeader === undefined
          ? {}
          : { scrollHeader: props.scrollHeader })}
        spaceId={props.spaceId}
        {...(props.starters === undefined ? {} : { starters: props.starters })}
        thread={deskThread.thread.session}
      />
    </EngentyAgent>
  );
}
