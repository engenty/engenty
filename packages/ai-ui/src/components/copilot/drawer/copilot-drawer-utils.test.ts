import { describe, expect, it } from "vitest";
import {
  isTalkConversationPathname,
  resolveCopilotCompanionOpen,
  resolveCopilotOpenDockMode,
  shouldShowCopilotFab,
} from "./copilot-drawer-utils";

describe("resolveCopilotOpenDockMode", () => {
  it("restores Work and Window from shell preference", () => {
    expect(resolveCopilotOpenDockMode("drawer")).toBe("drawer");
    expect(resolveCopilotOpenDockMode("sidebar")).toBe("sidebar");
    expect(resolveCopilotOpenDockMode("window")).toBe("window");
  });

  it("defaults to sidebar for missing preference", () => {
    expect(resolveCopilotOpenDockMode(null)).toBe("sidebar");
    expect(resolveCopilotOpenDockMode(undefined)).toBe("sidebar");
  });

  it("defaults to sidebar for invalid values", () => {
    expect(resolveCopilotOpenDockMode("nope" as "drawer")).toBe("sidebar");
  });
});

describe("resolveCopilotCompanionOpen", () => {
  it("stays on Talk when the main area is already a conversation page", () => {
    expect(
      resolveCopilotCompanionOpen({
        isTalkPage: true,
        preferredDockMode: "window",
      })
    ).toEqual({ kind: "talk" });
  });

  it("stays on Talk when dedicated chat chrome owns the page", () => {
    expect(
      resolveCopilotCompanionOpen({
        chromeHidden: true,
        isTalkPage: false,
        preferredDockMode: "sidebar",
      })
    ).toEqual({ kind: "talk" });
  });

  it("opens Work as a drawer on mobile", () => {
    expect(
      resolveCopilotCompanionOpen({
        isMobile: true,
        isTalkPage: false,
        preferredDockMode: "window",
      })
    ).toEqual({ kind: "work", dock: "drawer" });
  });

  it("restores Window when that was the last companion placement", () => {
    expect(
      resolveCopilotCompanionOpen({
        isTalkPage: false,
        preferredDockMode: "window",
      })
    ).toEqual({ kind: "work", dock: "window" });
  });

  it("defaults to Work (sidebar)", () => {
    expect(
      resolveCopilotCompanionOpen({
        isTalkPage: false,
        preferredDockMode: null,
      })
    ).toEqual({ kind: "work", dock: "sidebar" });
  });
});

describe("isTalkConversationPathname", () => {
  it("treats desks, rooms, and Copilot chat as Talk", () => {
    expect(
      isTalkConversationPathname("/s/company/agents/custom.researcher")
    ).toBe(true);
    expect(isTalkConversationPathname("/s/company/rooms/thread-1")).toBe(true);
    expect(isTalkConversationPathname("/s/company/copilot")).toBe(true);
    expect(isTalkConversationPathname("/copilot")).toBe(true);
  });

  it("does not treat roster, hire, or app pages as Talk", () => {
    expect(isTalkConversationPathname("/s/company/agents")).toBe(false);
    expect(isTalkConversationPathname("/s/company/agents/new")).toBe(false);
    expect(isTalkConversationPathname("/s/company")).toBe(false);
    expect(isTalkConversationPathname("/s/company/tasks")).toBe(false);
  });
});

describe("shouldShowCopilotFab", () => {
  it("keeps the docked blob on the app bar even when the panel is open", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: false,
        docked: true,
        isCollapsingToIcon: false,
        open: true,
      })
    ).toBe(true);
  });

  it("keeps the docked blob on dedicated chat chrome", () => {
    // `chromeHidden` hands the COMPANION surface to the page, not the app
    // bar's blob — the bar must not change shape when you open a chat.
    expect(
      shouldShowCopilotFab({
        chromeHidden: true,
        collapseToCircle: true,
        docked: true,
        isCollapsingToIcon: false,
        open: false,
      })
    ).toBe(true);
  });

  it("still hides the FLOATING blob on dedicated chat chrome", () => {
    // Nothing to dock onto there, and it would cover the page's own composer.
    expect(
      shouldShowCopilotFab({
        chromeHidden: true,
        collapseToCircle: true,
        isCollapsingToIcon: false,
        open: false,
      })
    ).toBe(false);
  });

  it("lets a live voice session take the docked slot", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: false,
        docked: true,
        isCollapsingToIcon: false,
        open: false,
        voiceSessionActive: true,
      })
    ).toBe(false);
  });

  it("shows the mobile corner blob when copilot is closed", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: true,
        isCollapsingToIcon: false,
        open: false,
      })
    ).toBe(true);
  });

  it("hides when shell copilot is open", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: true,
        isCollapsingToIcon: false,
        open: true,
      })
    ).toBe(false);
  });

  it("keeps FAB mounted during collapse morph while open", () => {
    expect(
      shouldShowCopilotFab({
        collapseToCircle: false,
        isCollapsingToIcon: true,
        open: true,
      })
    ).toBe(true);
  });
});
