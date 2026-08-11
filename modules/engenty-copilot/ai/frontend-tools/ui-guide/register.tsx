import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  dismissUiGuideSession,
  getUiGuideSession,
  resolveUiGuideTarget,
  showUiGuideSession,
  subscribeUiGuide,
  updateUiGuideSession,
  useAgentUiFieldElement,
} from "@engenty/app-shell";
import { useSyncExternalStore } from "react";
import {
  DISMISS_UI_GUIDE_SPEC,
  SHOW_UI_GUIDE_SPEC,
  UPDATE_UI_GUIDE_SPEC,
} from "./definition.js";

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

export function useRegisterShowUiGuideFrontendTool(): void {
  const getFieldElement = useAgentUiFieldElement();
  useEngentyFrontendTool({
    ...SHOW_UI_GUIDE_SPEC,
    handler: async (input) => {
      const presentation = input.presentation ?? "spotlight";
      const target_element = input.target
        ? resolveUiGuideTarget(input.target, { getFieldElement })
        : null;
      if (presentation !== "modal" && !target_element) {
        throw new Error(
          `target is required when presentation is "${presentation}".`
        );
      }
      return asJson(
        await showUiGuideSession({
          ...input,
          target_element,
        })
      );
    },
  });
}

/**
 * True while a guide is on screen.
 *
 * `update_ui_guide` and `dismiss_ui_guide` only mean anything then — the former
 * errors outright when nothing is open — yet their schemas rode in every model
 * call regardless, together about 1.4k tokens of the prompt. Registration is an
 * effect, so they attach when a guide opens and detach when it closes.
 */
function useUiGuideOpen(): boolean {
  return useSyncExternalStore(
    subscribeUiGuide,
    () => getUiGuideSession() !== null,
    () => false
  );
}

export function useRegisterUpdateUiGuideFrontendTool(): void {
  const getFieldElement = useAgentUiFieldElement();
  useEngentyFrontendTool({
    ...UPDATE_UI_GUIDE_SPEC,
    enabled: useUiGuideOpen(),
    handler: async (input) => {
      const target_element = input.target
        ? resolveUiGuideTarget(input.target, { getFieldElement })
        : undefined;
      return asJson(
        await updateUiGuideSession({
          ...input,
          ...(target_element === undefined ? {} : { target_element }),
        })
      );
    },
  });
}

export function useRegisterDismissUiGuideFrontendTool(): void {
  useEngentyFrontendTool({
    ...DISMISS_UI_GUIDE_SPEC,
    enabled: useUiGuideOpen(),
    handler: () => asJson(dismissUiGuideSession()),
  });
}

export function useRegisterUiGuideFrontendTools(): void {
  useRegisterShowUiGuideFrontendTool();
  useRegisterUpdateUiGuideFrontendTool();
  useRegisterDismissUiGuideFrontendTool();
}
