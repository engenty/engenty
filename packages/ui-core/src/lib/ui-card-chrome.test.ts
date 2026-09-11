import { describe, expect, it } from "vitest";
import {
  uiCardElevatedClassName,
  uiCardInteractiveClassName,
  uiCardPanelClassName,
  uiCardRaisedClassName,
  uiRowHoverClassName,
  uiStatusCardClassName,
} from "./ui-card-chrome.js";

describe("ui-card chrome class names", () => {
  it("exports surface classes without Tailwind chrome utilities", () => {
    expect(uiCardRaisedClassName).toBe("ui-card-raised");
    expect(uiCardElevatedClassName).toBe("ui-card-elevated");
    expect(uiCardPanelClassName).toBe("ui-card-panel");
    expect(uiCardInteractiveClassName).toBe("ui-card-interactive");
    expect(uiRowHoverClassName).toBe("ui-row-hover");
  });

  it("composes the space-data status tile from chrome + layout only", () => {
    expect(uiStatusCardClassName).toBe(
      "ui-card-raised ui-card-interactive flex h-full flex-col gap-1 p-4"
    );
    expect(uiStatusCardClassName).not.toMatch(
      /\b(border|bg-card|rounded-|hover:bg-|hover:shadow-)/
    );
  });
});
