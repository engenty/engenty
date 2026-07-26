import {
  EffortSelector,
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
  useAgentHostConfig,
  useEngentyAIContext,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuCheckboxItem } from "@engenty/ui-core";
import { useChatEffortChoice } from "../../hooks/chat/use-chat-effort-choice.js";
import { CopilotModelChooserControl } from "./copilot-model-chooser-control.js";

/**
 * Composer control: people pick how much thinking the turn deserves, not a
 * model id. The model chooser is not retired — it lives behind the expert
 * switch inside this menu, because a self-hosted install that pins a specific
 * model still needs to reach it.
 */
export function CopilotEffortControl(props: { disabled?: boolean }) {
  const { t } = useTranslation("engenty-copilot");
  const ai = useEngentyAIContext();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const {
    allowedEfforts,
    effort,
    expertModels,
    setEffort,
    toggleExpertModels,
  } = useChatEffortChoice();

  useAgentHostConfig({
    effort,
    hostKey: ENGENTY_COPILOT_HOST_KEY,
    // Leaving expert mode drops the pin: host config only ever merges, so
    // without this an experiment with a model id would silently outlive the
    // switch that produced it.
    ...(expertModels ? {} : { modelId: null }),
  });

  // Deliberately NOT disabled while awaiting an interrupt: a parked run is
  // waiting on the human, and an effort change simply applies to the next turn —
  // greying the control there just reads as broken.
  const disabled =
    props.disabled ?? (host.status !== "ready" || !ai.isTransportReady);

  return (
    <>
      <EffortSelector
        allowedEfforts={allowedEfforts}
        disabled={disabled}
        footer={
          <DropdownMenuCheckboxItem
            checked={expertModels}
            onCheckedChange={toggleExpertModels}
            onSelect={(event) => event.preventDefault()}
          >
            {t("chat.effortExpertToggle")}
          </DropdownMenuCheckboxItem>
        }
        onChange={setEffort}
        value={effort}
      />
      {expertModels ? (
        <CopilotModelChooserControl disabled={props.disabled} />
      ) : null}
    </>
  );
}
