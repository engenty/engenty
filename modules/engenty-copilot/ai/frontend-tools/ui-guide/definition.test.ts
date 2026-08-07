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

  it("registers all three in the base catalog", () => {
    const names = getCopilotBaseFrontendTools().map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "show_ui_guide",
        "update_ui_guide",
        "dismiss_ui_guide",
      ])
    );
  });
});
