import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { CLOSE_COPILOT_TOOL as closeCopilotTool } from "./close-copilot/definition.js";
import { FOCUS_FIELD_TOOL as focusFieldTool } from "./focus-field/definition.js";
import { SET_LOCALE_TOOL as setLocaleTool } from "./i18n-set-locale/definition.js";
import { NAVIGATE_TOOL as navigateTool } from "./navigate/definition.js";
import { OFFER_FILE_DOWNLOADS_TOOL as offerFileDownloadsTool } from "./offer-file-downloads/definition.js";
import { OPEN_COPILOT_TOOL as openCopilotTool } from "./open-copilot/definition.js";
import { OPEN_DIALOG_TOOL as openDialogTool } from "./open-dialog/definition.js";
import { SET_COPILOT_DOCK_MODE_TOOL as setCopilotDockModeTool } from "./set-copilot-dock-mode/definition.js";
import { SET_SHELL_THEME_TOOL as setShellThemeTool } from "./shell-set-theme/definition.js";
import { SHOW_ARTIFACT_TOOL as showArtifactTool } from "./show-artifact/definition.js";
import {
  DISMISS_UI_GUIDE_TOOL as dismissUiGuideTool,
  SHOW_UI_GUIDE_TOOL as showUiGuideTool,
  UPDATE_UI_GUIDE_TOOL as updateUiGuideTool,
} from "./ui-guide/definition.js";

// biome-ignore lint/performance/noBarrelFile: Public frontend-tool catalog entrypoint.
export { CLOSE_COPILOT_TOOL } from "./close-copilot/definition.js";
export { FOCUS_FIELD_TOOL } from "./focus-field/definition.js";
export { SET_LOCALE_TOOL } from "./i18n-set-locale/definition.js";
export { NAVIGATE_TOOL } from "./navigate/definition.js";
export { OFFER_FILE_DOWNLOADS_TOOL } from "./offer-file-downloads/definition.js";
export { OPEN_COPILOT_TOOL } from "./open-copilot/definition.js";
export { OPEN_DIALOG_TOOL } from "./open-dialog/definition.js";
export { SET_COPILOT_DOCK_MODE_TOOL } from "./set-copilot-dock-mode/definition.js";
export { SET_SHELL_THEME_TOOL } from "./shell-set-theme/definition.js";
export { SHOW_ARTIFACT_TOOL } from "./show-artifact/definition.js";
export {
  DISMISS_UI_GUIDE_TOOL,
  SHOW_UI_GUIDE_TOOL,
  UPDATE_UI_GUIDE_TOOL,
} from "./ui-guide/definition.js";

export function getCopilotBaseFrontendTools(): FrontendToolDefinition[] {
  return [
    navigateTool,
    setShellThemeTool,
    setLocaleTool,
    openCopilotTool,
    closeCopilotTool,
    setCopilotDockModeTool,
    openDialogTool,
    focusFieldTool,
    showUiGuideTool,
    updateUiGuideTool,
    dismissUiGuideTool,
    offerFileDownloadsTool,
    showArtifactTool,
  ];
}
