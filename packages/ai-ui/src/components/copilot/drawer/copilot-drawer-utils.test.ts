import { describe, expect, it } from "vitest";
import {
  resolveCopilotOpenDockMode,
  shouldShowCopilotFab,
} from "./copilot-drawer-utils";

describe("resolveCopilotOpenDockMode", () => {
  it("restores real dock modes from shell preference", () => {
    expect(resolveCopilotOpenDockMode("drawer")).toBe("drawer");
    expect(resolveCopilotOpenDockMode("sidebar")).toBe("sidebar");
    expect(resolveCopilotOpenDockMode("bottom")).toBe("bottom");
    expect(resolveCopilotOpenDockMode("floating")).toBe("floating");
  });

  it("defaults to sidebar for collapsed icon state and missing preference", () => {
    expect(resolveCopilotOpenDockMode("mini-floating")).toBe("sidebar");
    expect(resolveCopilotOpenDockMode(null)).toBe("sidebar");
    expect(resolveCopilotOpenDockMode(undefined)).toBe("sidebar");
  });

  it("defaults to sidebar for invalid values", () => {
    expect(resolveCopilotOpenDockMode("nope" as "drawer")).toBe("sidebar");
  });
});

describe("shouldShowCopilotFab", () => {
  it("shows only when collapsed to circle and copilot is closed", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: true,
        isCollapsingToIcon: false,
        open: false,
        showCompactLauncher: true,
      })
    ).toBe(true);
  });

  it("hides when shell copilot is open", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: true,
        isCollapsingToIcon: false,
        open: true,
        showCompactLauncher: false,
      })
    ).toBe(false);
  });

  it("hides when compact launcher is expanded", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: false,
        isCollapsingToIcon: false,
        open: false,
        showCompactLauncher: true,
      })
    ).toBe(false);
  });

  it("keeps FAB mounted during collapse morph while open", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: false,
        isCollapsingToIcon: true,
        open: true,
        showCompactLauncher: true,
      })
    ).toBe(true);
  });
});
