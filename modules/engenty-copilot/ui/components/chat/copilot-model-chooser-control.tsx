import {
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
  useAgentHostConfig,
  useEngentyAIContext,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useAgentChatModelOptions } from "../../hooks/chat/use-chat-model-options.js";
import { ChatModelChooser } from "./model-chooser.js";

export function CopilotModelChooserControl(props: {
  disabled?: boolean;
  /** Lane to pin the model on; defaults to the copilot host. */
  hostKey?: string;
}) {
  const hostKey = props.hostKey ?? ENGENTY_COPILOT_HOST_KEY;
  const { t } = useTranslation("engenty-copilot");
  const ai = useEngentyAIContext();
  const host = useAgentHost(hostKey);
  const modelOptions = useAgentChatModelOptions({
    isTransportReady: ai.isTransportReady,
    serviceBaseUrl: ai.serviceBaseUrl,
  });

  useAgentHostConfig({
    hostKey,
    modelId: modelOptions.activeModelId,
  });

  // Deliberately NOT disabled while awaiting an interrupt: a parked run is
  // waiting on the human, and a model change simply applies to the next turn —
  // greying the chooser there just reads as broken.
  const disabled =
    props.disabled ?? (host.status !== "ready" || !ai.isTransportReady);

  return (
    <ChatModelChooser
      activeModelId={modelOptions.activeModelId}
      ariaLabel={t("chat.modelChooserLabel")}
      disabled={disabled}
      emptyMessage={t("chat.modelChooser.emptyMessage")}
      onModelChange={modelOptions.setSelectedModelId}
      options={modelOptions.options}
      searchPlaceholder={t("chat.modelChooser.searchPlaceholder")}
    />
  );
}
