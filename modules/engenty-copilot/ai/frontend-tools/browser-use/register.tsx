import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  BROWSER_CLICK_SPEC,
  BROWSER_DOM_SNAPSHOT_SPEC,
  BROWSER_FOCUS_SPEC,
  BROWSER_HOVER_SPEC,
  BROWSER_INPUT_SPEC,
  BROWSER_SCREENSHOT_SPEC,
  BROWSER_SCROLL_SPEC,
} from "./definition.js";
import {
  handleBrowserClick,
  handleBrowserDomSnapshot,
  handleBrowserFocus,
  handleBrowserHover,
  handleBrowserInput,
  handleBrowserScreenshot,
  handleBrowserScroll,
} from "./handlers.js";

/**
 * Registers all browser-use frontend tools (screenshot, DOM snapshot, scroll,
 * click, hover, focus, input). Call this once from a component that is always
 * mounted (e.g. the copilot shell).
 *
 * These tools automatically become available in both normal chat and voice
 * chat since they register through the app-shell frontend tool pipeline.
 */
export function useRegisterBrowserUseFrontendTools(): void {
  useEngentyFrontendTool({
    ...BROWSER_SCREENSHOT_SPEC,
    handler: () => handleBrowserScreenshot(),
  });

  useEngentyFrontendTool({
    ...BROWSER_DOM_SNAPSHOT_SPEC,
    handler: (input) => handleBrowserDomSnapshot(input),
  });

  useEngentyFrontendTool({
    ...BROWSER_SCROLL_SPEC,
    handler: (input) => handleBrowserScroll(input),
  });

  useEngentyFrontendTool({
    ...BROWSER_CLICK_SPEC,
    handler: (input) => handleBrowserClick(input),
  });

  useEngentyFrontendTool({
    ...BROWSER_HOVER_SPEC,
    handler: (input) => handleBrowserHover(input),
  });

  useEngentyFrontendTool({
    ...BROWSER_FOCUS_SPEC,
    handler: (input) => handleBrowserFocus(input),
  });

  useEngentyFrontendTool({
    ...BROWSER_INPUT_SPEC,
    handler: (input) => handleBrowserInput(input),
  });
}
