import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppsAiThreadQuery } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import { useEngentyAIContext } from "../../agent-provider/engenty-ai-provider.js";
import { useComposerOptionsQuery } from "../../lib/admin/ai-settings-queries.js";
import {
  type ChatModePick,
  chatModeRunConfig,
  isExtraAllowed,
  resolveChatModePick,
  threadChatModePick,
} from "./chat-mode.js";
import {
  baseChatModePick,
  chatModeDraftKey,
  chatModeStoreVersion,
  dropChatModeDraft,
  readChatModeDraft,
  setChatModeDraft,
  setExtraTakesReasoning,
  subscribeChatModeStore,
} from "./chat-mode-store.js";
import { useEffortGrant } from "./use-effort-grant.js";

/**
 * The composer's Normal / Extra / Custom pick for one lane's thread, what it
 * sends with a turn, and what it can offer: whether the plan licenses Extra,
 * the models behind Normal and Extra, and the platform's Custom list.
 *
 * The pick is per thread (see `threadChatModePick`) and re-clamped on every
 * read (see `resolveChatModePick`), so a plan downgrade or a model taken off
 * the list quietly lands on Normal.
 */
export function useChatMode(input: {
  hostKey: string;
  threadId: string | null;
}) {
  const ai = useEngentyAIContext();
  const { allowedEfforts } = useEffortGrant();
  const composerQuery = useComposerOptionsQuery();
  const composer = composerQuery.data;
  // Same key as the lane's own detail query, so this adds no request.
  const threadQuery = useAppsAiThreadQuery({
    enabled: ai.isTransportReady && ai.serviceBaseUrl.length > 0,
    serviceBaseUrl: ai.serviceBaseUrl,
    threadId: input.threadId,
  });
  useSyncExternalStore(
    subscribeChatModeStore,
    chatModeStoreVersion,
    chatModeStoreVersion
  );

  const draftKey = chatModeDraftKey(input.hostKey, input.threadId);
  const chatMode = input.threadId
    ? threadQuery.data?.metadata?.chat_mode
    : undefined;
  const { draftSuperseded, pick: threadPick } = threadChatModePick({
    base: baseChatModePick(),
    chatMode,
    draft: readChatModeDraft(draftKey),
    metadataReadAt: threadQuery.dataUpdatedAt,
  });
  useEffect(() => {
    if (draftSuperseded) {
      dropChatModeDraft(draftKey);
    }
  }, [draftKey, draftSuperseded]);

  const extraModel = composer?.modes.extra.model ?? null;
  const extraTakesReasoning = composer
    ? Boolean(extraModel?.reasoning_effort)
    : undefined;
  useEffect(() => {
    setExtraTakesReasoning(extraTakesReasoning);
  }, [extraTakesReasoning]);

  const extraAllowed =
    (composer?.modes.extra.allowed ?? true) && isExtraAllowed(allowedEfforts);
  const customModels = composer?.custom_models;
  const pick = resolveChatModePick(threadPick, { customModels, extraAllowed });
  const setPick = useCallback(
    (next: ChatModePick) => setChatModeDraft(draftKey, next),
    [draftKey]
  );

  return {
    customModels: customModels ?? [],
    extraAllowed,
    extraModel,
    normalModel: composer?.modes.normal.model ?? null,
    pick,
    run: chatModeRunConfig(pick, {
      extraTakesReasoning,
      threadHasServerMode: Boolean(chatMode),
    }),
    setPick,
  };
}
