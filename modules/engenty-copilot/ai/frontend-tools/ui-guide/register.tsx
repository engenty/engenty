import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  dismissUiGuideSession,
  resolveUiGuideTarget,
  showUiGuideSession,
  updateUiGuideSession,
  useAgentUiFieldElement,
} from "@engenty/app-shell";
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

export function useRegisterUpdateUiGuideFrontendTool(): void {
  const getFieldElement = useAgentUiFieldElement();
  useEngentyFrontendTool({
    ...UPDATE_UI_GUIDE_SPEC,
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
    handler: () => asJson(dismissUiGuideSession()),
  });
}

export function useRegisterUiGuideFrontendTools(): void {
  useRegisterShowUiGuideFrontendTool();
  useRegisterUpdateUiGuideFrontendTool();
  useRegisterDismissUiGuideFrontendTool();
}
