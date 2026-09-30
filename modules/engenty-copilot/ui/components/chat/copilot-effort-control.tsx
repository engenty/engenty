import {
  ChatModeSelector,
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
  useAgentHostConfig,
  useChatMode,
  useDeveloperModeEnabled,
  useEngentyAIContext,
} from "@engenty/ai-ui";

/**
 * Composer control: Normal or Extra for everyone, each naming the model it
 * runs, and a Custom flyout with the models the platform offers (plus a
 * reasoning level where the model takes one). Developer mode adds the raw
 * model ids.
 *
 * `hostKey` points it at a lane: the copilot host by default, or a specialist
 * desk's per-agent host, so every chat lane offers the same control. The pick
 * belongs to the lane's thread: a new chat starts on Normal, and a chat the
 * server holds on Extra shows Extra until its next chapter.
 */
export function CopilotEffortControl(props: {
  disabled?: boolean;
  hostKey?: string;
}) {
  const hostKey = props.hostKey ?? ENGENTY_COPILOT_HOST_KEY;
  const ai = useEngentyAIContext();
  const host = useAgentHost(hostKey);
  const developerMode = useDeveloperModeEnabled();
  const {
    customModels,
    extraAllowed,
    extraModel,
    normalModel,
    pick,
    run,
    setPick,
  } = useChatMode({ hostKey, threadId: host.threadId });

  // All three always travel: host config only ever merges, so leaving one out
  // would let a Custom model or a reasoning level outlive the pick that set it.
  useAgentHostConfig({
    effort: run.effort,
    hostKey,
    modelId: run.modelId,
    reasoningEffort: run.reasoningEffort,
  });

  // Deliberately NOT disabled while awaiting an interrupt: a parked run is
  // waiting on the human, and a change simply applies to the next turn —
  // greying the control there just reads as broken.
  const disabled =
    props.disabled ?? (host.status !== "ready" || !ai.isTransportReady);

  return (
    <ChatModeSelector
      customModels={customModels}
      developerMode={developerMode}
      disabled={disabled}
      extraAllowed={extraAllowed}
      extraModel={extraModel}
      normalModel={normalModel}
      onChange={setPick}
      pick={pick}
    />
  );
}
