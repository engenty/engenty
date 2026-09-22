import type { CopilotPanelContentProps } from "../panel/copilot-panel-content-types.js";
import {
  CHAT_LANE_COMPOSER_CLASS,
  CHAT_LANE_TRANSCRIPT_CLASS,
} from "./chat-lane-layout.js";

/** Every panel prop a lane does NOT get to decide for itself. */
export type ChatLanePanelBaseProps = Pick<
  CopilotPanelContentProps,
  | "attachLabel"
  | "bodyOnly"
  | "closeLabel"
  | "composerDockStyle"
  | "composerWrapperClassName"
  | "contentBodyGutter"
  | "detachLabel"
  | "enableStatusFlap"
  | "minimalChrome"
  | "onClose"
  | "onPanelModeChange"
  | "panelMode"
  | "transcriptContainerClassName"
  | "transcriptLoadingLabel"
  | "transcriptSurface"
>;

function noop() {}

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
 * Note what is deliberately NOT here: `contextOptions`,
 * `headerVariant` — Talk vs Work vs Window is shared chrome now. The lane
 * still does not own those widgets; the shell / drawer injects `positionMenu`.
 *
 * @param t The `common` namespace translator.
 */
export function chatLanePanelBaseProps(
  t: (key: string) => string
): ChatLanePanelBaseProps {
  return {
    attachLabel: t("copilot.position.sidebar"),
    bodyOnly: true,
    closeLabel: t("copilot.position.heading"),
    composerDockStyle: true,
    composerWrapperClassName: CHAT_LANE_COMPOSER_CLASS,
    contentBodyGutter: "flush",
    detachLabel: t("copilot.position.window"),
    enableStatusFlap: false,
    minimalChrome: true,
    onClose: noop,
    onPanelModeChange: noop,
    panelMode: "docked",
    transcriptContainerClassName: CHAT_LANE_TRANSCRIPT_CLASS,
    transcriptLoadingLabel: t("shell.loading"),
    transcriptSurface: "chat",
  };
}
