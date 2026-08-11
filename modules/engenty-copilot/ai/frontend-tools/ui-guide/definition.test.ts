import { describe, expect, it } from "vitest";
import { getCopilotBaseFrontendTools } from "../index.js";
import {
  DISMISS_UI_GUIDE_TOOL,
  SHOW_UI_GUIDE_TOOL,
  UPDATE_UI_GUIDE_TOOL,
} from "./definition.js";

describe("ui guide frontend tools catalog", () => {
  it("exports show / update / dismiss definitions", () => {
    expect(SHOW_UI_GUIDE_TOOL.name).toBe("show_ui_guide");
    expect(UPDATE_UI_GUIDE_TOOL.name).toBe("update_ui_guide");
    expect(DISMISS_UI_GUIDE_TOOL.name).toBe("dismiss_ui_guide");
  });

  it("puts only the guide ENTRY POINT in the always-on catalog", () => {
    // `update_ui_guide` and `dismiss_ui_guide` apply only while a guide is
    // open — `update_ui_guide` errors outright otherwise — so the browser
    // registers them for exactly that window (ui-guide/register.tsx). Listing
    // them here would put ~0.9k of schema back into every model call.
    const names = getCopilotBaseFrontendTools().map((tool) => tool.name);
    expect(names).toContain("show_ui_guide");
    expect(names).not.toContain("update_ui_guide");
    expect(names).not.toContain("dismiss_ui_guide");
  });
});
