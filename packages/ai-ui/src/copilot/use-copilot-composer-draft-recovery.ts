"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createAgUiHydrationSignature,
  type EngentyAgUiMessage,
} from "../ag-ui/conversation.js";
import {
  type CopilotLocalRecoveryThreadKey,
  clearCopilotComposerDraft,
  extractLastUserMessageText,
  isCopilotComposerDraftRecoveryEnabled,
  readCopilotComposerDraft,
  writeCopilotComposerDraft,
} from "./local-recovery.js";

const COMPOSER_DRAFT_DEBOUNCE_MS = 400;

export interface UseCopilotComposerDraftRecoveryOptions {
  enabled?: boolean;
  messages?: readonly EngentyAgUiMessage[];
  tenantId: string;
  threadId: CopilotLocalRecoveryThreadKey;
  userId: string;
}

export function resolveCopilotRecoveryThreadKey(
  threadId: string | null | undefined,
  isNewThreadRoute?: boolean
): CopilotLocalRecoveryThreadKey {
  if (isNewThreadRoute || !threadId) {
    return "new";
  }
  return threadId;
}

export function useCopilotComposerDraftRecovery(
  options: UseCopilotComposerDraftRecoveryOptions
) {
  const scopeReady = Boolean(options.tenantId && options.userId);
  const recoveryEnabled =
    (options.enabled ?? true) &&
    isCopilotComposerDraftRecoveryEnabled() &&
    scopeReady;

  const storageParams = useMemo(
    () => ({
      tenantId: options.tenantId,
      userId: options.userId,
      threadId: options.threadId,
    }),
    [options.threadId, options.tenantId, options.userId]
  );

  const messagesSignature = useMemo(
    () => createAgUiHydrationSignature(options.messages),
    [options.messages]
  );

  const [draft, setDraftState] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const hydratedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recoveryEnabled) {
      hydratedSessionRef.current = options.threadId;
      return;
    }
    if (hydratedSessionRef.current === options.threadId) {
      return;
    }
    hydratedSessionRef.current = options.threadId;
    const restored = readCopilotComposerDraft(storageParams);
    if (draftRef.current.trim().length > 0 && restored !== draftRef.current) {
      return;
    }
    setDraftState(restored);
  }, [options.threadId, recoveryEnabled, storageParams]);

  const setDraft = useCallback<Dispatch<SetStateAction<string>>>((value) => {
    setDraftState(value);
  }, []);

  const clearPersistedDraft = useCallback(() => {
    if (!recoveryEnabled) {
      return;
    }
    clearCopilotComposerDraft(storageParams);
  }, [recoveryEnabled, storageParams]);

  const clearDraft = useCallback(() => {
    setDraftState("");
    clearPersistedDraft();
  }, [clearPersistedDraft]);

  useEffect(() => {
    if (!recoveryEnabled) {
      return;
    }
    const handle = window.setTimeout(() => {
      writeCopilotComposerDraft({
        ...storageParams,
        composerDraft: draftRef.current,
      });
    }, COMPOSER_DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draft, recoveryEnabled, storageParams]);

  useEffect(() => {
    if (!(recoveryEnabled && options.messages?.length)) {
      return;
    }
    const lastUserText = extractLastUserMessageText(options.messages);
    if (!lastUserText) {
      return;
    }
    const currentDraft = draftRef.current.trim();
    if (currentDraft.length > 0 && currentDraft === lastUserText) {
      clearDraft();
    }
  }, [clearDraft, messagesSignature, recoveryEnabled]);

  return {
    clearDraft,
    clearPersistedDraft,
    draft,
    recoveryEnabled,
    setDraft,
  };
}
