import type { CopilotPanelContentProps } from "../panel/copilot-panel-content-types.js";
import {
  CHAT_LANE_COMPOSER_CLASS,
  CHAT_LANE_TRANSCRIPT_CLASS,
} from "./chat-lane-layout.js";

/** Every panel prop a lane does NOT get to decide for itself. */
export type ChatLanePanelBaseProps = Pick<
  CopilotPanelContentProps,
  | "applyError"
  | "applySelectedLabel"
  | "artifactError"
  | "artifactLoadFailedLabel"
  | "attachLabel"
  | "bodyOnly"
  | "cancelLabel"
  | "closeLabel"
  | "composerDockStyle"
  | "composerWrapperClassName"
  | "contentBodyGutter"
  | "detachLabel"
  | "enableStatusFlap"
  | "isApplying"
  | "latestSuggestions"
  | "minimalChrome"
  | "onApplySuggestions"
  | "onClose"
  | "onPanelModeChange"
  | "panelMode"
  | "reviewPromptLabel"
  | "selectedCountLabel"
  | "startMode"
  | "suggestedUpdatesLabel"
  | "transcriptContainerClassName"
  | "transcriptLoadingLabel"
  | "transcriptSurface"
  | "triggerType"
>;

const EMPTY_SUGGESTIONS: [] = [];

function noop() {}

async function noopAsync() {}

/**
 * The shared half of a chat lane's panel configuration.
 *
 * A lane brings its agent, its transcript and its empty state; everything here —
 * the column measure, the dock-style composer, the flat chrome, the labels — is
 * what makes the copilot chat and a specialist desk read as one surface. Spread
 * it first, then add the lane's own props.
 *
 * `enableStatusFlap` is off for every lane on purpose: the flap exists to show a
 * reply that is otherwise off-screen, and a lane always has the transcript right
 * above the composer.
 *
 * Note what is deliberately NOT here: `positionMenu`, `contextOptions`,
 * `headerVariant` — the drawer/sidebar/floating affordances. Those belong to the
 * copilot, which can be moved around the app. A specialist lives in its lane.
 *
 * @param t The `common` namespace translator.
 */
export function chatLanePanelBaseProps(
  t: (key: string) => string
): ChatLanePanelBaseProps {
  return {
    applyError: null,
    applySelectedLabel: t("copilot.applySelected"),
    artifactError: null,
    artifactLoadFailedLabel: t("copilot.artifactLoadFailed"),
    attachLabel: t("copilot.position.sidebar"),
    bodyOnly: true,
    cancelLabel: t("copilot.cancel"),
    closeLabel: t("copilot.position.heading"),
    composerDockStyle: true,
    composerWrapperClassName: CHAT_LANE_COMPOSER_CLASS,
    contentBodyGutter: "flush",
    detachLabel: t("copilot.position.floating"),
    enableStatusFlap: false,
    isApplying: false,
    latestSuggestions: EMPTY_SUGGESTIONS,
    minimalChrome: true,
    onApplySuggestions: noopAsync,
    onClose: noop,
    onPanelModeChange: noop,
    panelMode: "docked",
    reviewPromptLabel: t("copilot.reviewPrompt"),
    selectedCountLabel: t("copilot.selected"),
    startMode: "manual",
    suggestedUpdatesLabel: t("copilot.suggestedUpdates"),
    transcriptContainerClassName: CHAT_LANE_TRANSCRIPT_CLASS,
    transcriptLoadingLabel: t("shell.loading"),
    transcriptSurface: "chat",
    triggerType: "message_copilot",
  };
}
