import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { useAgentUiFieldFocuser } from "@engenty/app-shell";
import { FOCUS_FIELD_SPEC } from "./definition.js";

export function useRegisterFocusFieldFrontendTool(): void {
  const focusRegisteredField = useAgentUiFieldFocuser();
  useEngentyFrontendTool({
    ...FOCUS_FIELD_SPEC,
    handler: ({ field_id }) => {
      const fieldId = field_id.trim();
      if (!fieldId) {
        throw new Error("field_id is required.");
      }
      if (!focusRegisteredField(fieldId)) {
        throw new Error(`Field is not registered: ${fieldId}`);
      }
      return { ok: true };
    },
  });
}
