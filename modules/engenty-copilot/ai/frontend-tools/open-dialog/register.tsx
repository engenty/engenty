import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { useAgentUiDialogOpener } from "@engenty/app-shell";
import { OPEN_DIALOG_SPEC } from "./definition.js";

export function useRegisterOpenDialogFrontendTool(): void {
  const openRegisteredDialog = useAgentUiDialogOpener();
  useEngentyFrontendTool({
    ...OPEN_DIALOG_SPEC,
    handler: async ({ dialog_id, payload }) => {
      const dialogId = dialog_id.trim();
      if (!dialogId) {
        throw new Error("dialog_id is required.");
      }
      const opened = await openRegisteredDialog(
        dialogId,
        payload as Record<string, JsonValue> | undefined
      );
      if (!opened) {
        throw new Error(`Dialog is not registered: ${dialogId}`);
      }
      return { ok: true };
    },
  });
}
