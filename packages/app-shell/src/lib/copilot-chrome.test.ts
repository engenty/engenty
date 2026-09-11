import { describe, expect, it } from "vitest";
import {
  isCopilotShellSlotOpen,
  shouldShowInlineCopilotSidebar,
} from "./copilot-chrome";

describe("isCopilotShellSlotOpen", () => {
  it("stays open only when the shell is open and chrome is not hidden", () => {
    expect(isCopilotShellSlotOpen({ chromeHidden: false, open: true })).toBe(
      true
    );
    expect(isCopilotShellSlotOpen({ chromeHidden: false, open: false })).toBe(
      false
    );
  });

  it("collapses the slot on dedicated chat even if persisted open is true", () => {
    expect(isCopilotShellSlotOpen({ chromeHidden: true, open: true })).toBe(
      false
    );
  });
});

describe("shouldShowInlineCopilotSidebar", () => {
  it("reserves the column only for sidebar dock with visible chrome", () => {
    expect(
      shouldShowInlineCopilotSidebar({
        chromeHidden: false,
        dockMode: "sidebar",
      })
    ).toBe(true);
    expect(
      shouldShowInlineCopilotSidebar({
        chromeHidden: false,
        dockMode: "drawer",
      })
    ).toBe(false);
  });

  it("does not reserve an empty sidebar column on dedicated chat", () => {
    expect(
      shouldShowInlineCopilotSidebar({
        chromeHidden: true,
        dockMode: "sidebar",
      })
    ).toBe(false);
  });
});
