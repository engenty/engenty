"use client";

import { isAgentThreadId } from "@engenty/ai-core/browser";
import { useCallback, useEffect, useMemo } from "react";
import {
  CopilotThreadChooser,
  type CopilotThreadRow,
} from "../copilot-thread-chooser";

export interface CopilotDrawerThreadChooserLabels {
  emptyThreads: string;
  newThread: string;
  threadsHeading: string;
}

export interface UseCopilotDrawerThreadChooserInput {
  chooserThreads: CopilotThreadRow[];
  chooserThreadsLoading: boolean;
  clearDrawerLocalState: () => void;
  controlledActiveThread?: {
    threadId: string | null;
    setThreadId: (id: string | null) => void;
  };
  injectedThreadId: string | null;
  threadChooserEnabled: boolean;
  threadChooserLabels?: CopilotDrawerThreadChooserLabels;
}

const DEFAULT_LABELS: CopilotDrawerThreadChooserLabels = {
  emptyThreads: "No chats yet",
  newThread: "New chat",
  threadsHeading: "Chats",
};

export function useCopilotDrawerThreadChooser(
  input: UseCopilotDrawerThreadChooserInput
) {
  const labels = input.threadChooserLabels ?? DEFAULT_LABELS;
  const externalThreadId = input.controlledActiveThread?.threadId ?? null;
  const setExternalThreadId =
    input.controlledActiveThread?.setThreadId ?? (() => {});

  useEffect(() => {
    if (!input.threadChooserEnabled) {
      return;
    }
    const id = input.injectedThreadId?.trim() ?? "";
    if (!isAgentThreadId(id)) {
      return;
    }
    if (externalThreadId === id) {
      return;
    }
    setExternalThreadId(id);
  }, [
    input.threadChooserEnabled,
    externalThreadId,
    input.injectedThreadId,
    setExternalThreadId,
  ]);

  const handleNewThread = useCallback(() => {
    setExternalThreadId(null);
    input.clearDrawerLocalState();
  }, [input.clearDrawerLocalState, setExternalThreadId]);

  const handleSelectThread = useCallback(
    (row: CopilotThreadRow) => {
      setExternalThreadId(row.id);
      input.clearDrawerLocalState();
    },
    [input.clearDrawerLocalState, setExternalThreadId]
  );

  const renderCopilotThreadChooser = useCallback(
    (variant: "compact" | "panel") => {
      if (!input.threadChooserEnabled) {
        return null;
      }
      return (
        <CopilotThreadChooser
          activeThreadId={externalThreadId}
          composeNewLabel={labels.newThread}
          emptyThreadsLabel={labels.emptyThreads}
          loading={input.chooserThreadsLoading}
          newThreadLabel={labels.newThread}
          onNewThread={handleNewThread}
          onSelectThread={handleSelectThread}
          threads={input.chooserThreads}
          threadsSectionLabel={labels.threadsHeading}
          variant={variant}
        />
      );
    },
    [
      externalThreadId,
      handleNewThread,
      handleSelectThread,
      input.chooserThreads,
      input.chooserThreadsLoading,
      input.threadChooserEnabled,
      labels.emptyThreads,
      labels.newThread,
      labels.threadsHeading,
    ]
  );

  return useMemo(
    () => ({
      externalThreadId,
      handleNewThread,
      renderCopilotThreadChooser,
    }),
    [externalThreadId, handleNewThread, renderCopilotThreadChooser]
  );
}
