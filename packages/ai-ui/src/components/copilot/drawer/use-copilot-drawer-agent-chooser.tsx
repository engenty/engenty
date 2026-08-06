"use client";

import { isAgentThreadId } from "@engenty/ai-core/browser";
import { useCallback } from "react";
import { CopilotAgentPicker } from "../composer/copilot-agent-picker.js";
import {
  CopilotAgentThreadChooser,
  type CopilotAgentThreadChooserThread,
} from "../composer/copilot-agent-thread-chooser.js";
import { CopilotRecentThreadsChooser } from "../composer/copilot-recent-threads-chooser.js";

const GENERAL_CHAT_AGENT_ID = "engenty.copilot";

export function useCopilotDrawerAgentChooser(input: {
  activeThreadId: string | null;
  agentChooserLabels: {
    emptySessions: string;
    generalCopilot?: string;
    newSession: string;
    selectAgent: string;
    sessionsHeading: string;
  };
  agentSessionChooserEnabled: boolean;
  appsAiSessionsApi: string;
  chooserMenuAgentId: string | null;
  chooserMenuSessions: CopilotAgentThreadChooserThread[];
  chooserMenuSessionsLoading: boolean;
  clearDrawerComposerState: () => void;
  floatingChatCanonicalMessagesLoading: boolean;
  floatingChatRouteBinding: boolean;
  getHeaders?: () => Promise<Record<string, string>>;
  onChooserMenuAgentIdChange?: (agentId: string) => void;
  recentSessionsChooser: boolean;
  registeredAgents: Array<{ id: string; name: string }>;
  registeredAgentsLoading: boolean;
  selectedAgentId: string | null;
  setActiveThreadId: (threadId: string | null) => void;
  setSelectedAgentId: (id: string | null) => void;
  threadIdRef: React.MutableRefObject<string | null>;
}) {
  const handleAgentChooserNewSession = useCallback(
    (agentId: string) => {
      input.setSelectedAgentId(agentId);
      input.setActiveThreadId(null);
      input.clearDrawerComposerState();
    },
    [
      input.clearDrawerComposerState,
      input.setActiveThreadId,
      input.setSelectedAgentId,
    ]
  );

  const handleFlatRecentNewSession = useCallback(() => {
    input.setSelectedAgentId(null);
    input.setActiveThreadId(null);
    input.clearDrawerComposerState();
  }, [
    input.clearDrawerComposerState,
    input.setActiveThreadId,
    input.setSelectedAgentId,
  ]);

  const handleComposerAgentSelect = useCallback(
    async (nextId: string | null) => {
      const normalized =
        nextId && nextId.trim() !== GENERAL_CHAT_AGENT_ID
          ? nextId.trim()
          : null;
      if (normalized === input.selectedAgentId) {
        return;
      }
      const threadId = input.threadIdRef.current?.trim() ?? "";
      if (isAgentThreadId(threadId) && input.appsAiSessionsApi) {
        const nextAgentTypeKey = normalized ?? "engenty.copilot";
        const tokenHeaders: Record<string, string> = input.getHeaders
          ? await input.getHeaders()
          : {};
        const response = await fetch(
          `${input.appsAiSessionsApi}/${encodeURIComponent(threadId)}`,
          {
            body: JSON.stringify({ agent_id: nextAgentTypeKey }),
            headers: {
              "content-type": "application/json",
              ...tokenHeaders,
            },
            method: "PATCH",
          }
        );
        if (!response.ok) {
          throw new Error(`Failed to update chat agent (${response.status})`);
        }
        input.setSelectedAgentId(normalized);
        return;
      }
      input.setSelectedAgentId(normalized);
      if (input.floatingChatRouteBinding) {
        input.setActiveThreadId(null);
      }
      input.clearDrawerComposerState();
    },
    [
      input.appsAiSessionsApi,
      input.clearDrawerComposerState,
      input.floatingChatRouteBinding,
      input.getHeaders,
      input.selectedAgentId,
      input.setActiveThreadId,
      input.setSelectedAgentId,
      input.threadIdRef,
    ]
  );

  const handleAgentChooserResume = useCallback(
    (row: CopilotAgentThreadChooserThread) => {
      const aid = row.current_agent_id?.trim();
      if (aid && aid !== GENERAL_CHAT_AGENT_ID) {
        input.setSelectedAgentId(aid);
      } else {
        input.setSelectedAgentId(null);
      }
      input.setActiveThreadId(row.id);
      input.clearDrawerComposerState();
    },
    [
      input.clearDrawerComposerState,
      input.setActiveThreadId,
      input.setSelectedAgentId,
    ]
  );

  const renderAgentSessionChooser = useCallback(
    (variant: "compact" | "panel") => {
      if (!input.agentSessionChooserEnabled) {
        return null;
      }
      if (input.recentSessionsChooser) {
        if (variant === "compact") {
          return (
            <CopilotAgentPicker
              agents={input.registeredAgents}
              agentsLoading={input.registeredAgentsLoading}
              generalAgentLabel={
                input.agentChooserLabels.generalCopilot ?? "Engenty"
              }
              onSelectAgent={handleComposerAgentSelect}
              pickAgentLabel={input.agentChooserLabels.selectAgent}
              selectedAgentId={input.selectedAgentId}
              variant="compact"
            />
          );
        }
        return (
          <CopilotRecentThreadsChooser
            activeThreadId={input.activeThreadId}
            composeNewLabel={input.agentChooserLabels.newSession}
            emptyThreadsLabel={input.agentChooserLabels.emptySessions}
            newThreadLabel={input.agentChooserLabels.newSession}
            onNewThread={handleFlatRecentNewSession}
            onResumeThread={handleAgentChooserResume}
            threads={input.chooserMenuSessions}
            threadsLoading={
              input.chooserMenuSessionsLoading ||
              Boolean(
                input.floatingChatCanonicalMessagesLoading &&
                  input.activeThreadId &&
                  isAgentThreadId(input.activeThreadId.trim())
              )
            }
            threadsSectionLabel={input.agentChooserLabels.sessionsHeading}
            variant="panel"
          />
        );
      }
      return (
        <CopilotAgentThreadChooser
          agents={input.registeredAgents}
          agentsLoading={input.registeredAgentsLoading}
          emptyThreadsLabel={input.agentChooserLabels.emptySessions}
          menuAgentId={input.chooserMenuAgentId}
          menuThreads={input.chooserMenuSessions}
          menuThreadsLoading={input.chooserMenuSessionsLoading}
          newThreadLabel={input.agentChooserLabels.newSession}
          onNewThreadForAgent={handleAgentChooserNewSession}
          onRequestAgentThreads={(id) => input.onChooserMenuAgentIdChange?.(id)}
          onResumeThread={handleAgentChooserResume}
          onSelectAgent={input.setSelectedAgentId}
          selectAgentLabel={input.agentChooserLabels.selectAgent}
          selectedAgentId={input.selectedAgentId}
          threadsSectionLabel={input.agentChooserLabels.sessionsHeading}
          variant={variant}
        />
      );
    },
    [
      handleAgentChooserNewSession,
      handleAgentChooserResume,
      handleComposerAgentSelect,
      handleFlatRecentNewSession,
      input,
    ]
  );

  return {
    handleAgentChooserNewSession,
    handleComposerAgentSelect,
    renderAgentSessionChooser,
  };
}
