import {
  EffortSelector,
  ENGENTY_COPILOT_HOST_KEY,
  useAgentHost,
  useAgentHostConfig,
  useDeveloperModeEnabled,
  useEffortModelBindings,
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
 *
 * The expert switch itself is gated on developer mode. Offering "choose a
 * model" to everyone reintroduces exactly the decision this control exists to
 * take away: three hundred ids in front of someone who wanted to ask a
 * question. Developer mode is already the line the product draws around
 * plumbing that is useful to see and unhelpful to be shown. In that same mode
 * the bound model for each tier is shown under the label — still not a picker,
 * just the answer to "what does medium run?"
 */
export function CopilotEffortControl(props: { disabled?: boolean }) {
  const { t } = useTranslation("engenty-copilot");
  const ai = useEngentyAIContext();
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const developerMode = useDeveloperModeEnabled();
  const modelByEffort = useEffortModelBindings(developerMode);
  const {
    allowedEfforts,
    effort,
    expertModels,
    setEffort,
    toggleExpertModels,
  } = useChatEffortChoice();
  // A pin made in developer mode must not keep steering the turn after the mode
  // is switched off — the control that produced it is gone, so it would be
  // unreachable and invisible.
  const expertActive = developerMode && expertModels;

  useAgentHostConfig({
    effort,
    hostKey: ENGENTY_COPILOT_HOST_KEY,
    // Leaving expert mode drops the pin: host config only ever merges, so
    // without this an experiment with a model id would silently outlive the
    // switch that produced it.
    ...(expertActive ? {} : { modelId: null }),
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
          developerMode ? (
            <DropdownMenuCheckboxItem
              checked={expertModels}
              onCheckedChange={toggleExpertModels}
              onSelect={(event) => event.preventDefault()}
            >
              {t("chat.effortExpertToggle")}
            </DropdownMenuCheckboxItem>
          ) : null
        }
        {...(developerMode ? { modelByEffort } : {})}
        onChange={setEffort}
        value={effort}
      />
      {expertActive ? (
        <CopilotModelChooserControl disabled={props.disabled} />
      ) : null}
    </>
  );
}
