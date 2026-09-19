"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useCallback } from "react";
import { useEngentyThreads } from "../../threads/index.js";
import { AgentDeskChat } from "./agent-desk-chat.js";
import { agentDeskHostKey } from "./agent-desk-url.js";
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";

/**
 * Hired Engenty chat in the shared Work / Window chrome. Same lane as Talk,
 * different hostKey from Copilot. Window/Work is chat only — the desk
 * context card and empty-landing stay on Talk.
 */
export function CompanionWorkChat(props: { agentId: string; spaceId: string }) {
  const { i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const feedQuery = useAgentDeskFeed({
    agentId: props.agentId,
    locale,
    spaceId: props.spaceId,
  });
  const hostKey = agentDeskHostKey(props.spaceId, props.agentId);
  const threads = useEngentyThreads(hostKey, { agentId: props.agentId });
  const onThreadCreated = useCallback(
    (threadId: string) => {
      threads.setActiveThreadId(threadId);
    },
    [threads]
  );

  if (!feedQuery.data) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-muted-foreground text-sm">
        {feedQuery.isPending ? "Loading…" : "This Engenty could not be opened."}
      </div>
    );
  }

  const agent = feedQuery.data.agent;
  return (
    <AgentDeskChat
      agentConnectors={agent.connectors}
      agentDescription={agent.description}
      agentEngenty={agent.engenty}
      agentId={agent.id}
      agentName={agent.name}
      agentRole={agent.role}
      agentScope={agent.agentScope}
      agentSkills={agent.skills}
      agentStarters={agent.starters}
      companion
      contextPane={false}
      hostKey={hostKey}
      onThreadCreated={onThreadCreated}
      spaceId={props.spaceId}
      starters={false}
      threadId={threads.activeThreadId}
    />
  );
}
