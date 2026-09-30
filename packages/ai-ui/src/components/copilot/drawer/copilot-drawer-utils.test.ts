import type { CopilotDockMode } from "@engenty/app-shell";
import { describe, expect, it } from "vitest";
import {
  isTalkConversationPathname,
  type OpenCopilotShellInput,
  openCopilotShell,
  shouldShowCopilotFab,
} from "./copilot-drawer-utils";

function openShell(
  input: Omit<OpenCopilotShellInput, "setOpen" | "setPreferredDockMode">
) {
  const state: { dock: CopilotDockMode | null; open: boolean } = {
    dock: null,
    open: false,
  };
  const result = openCopilotShell({
    ...input,
    setOpen: (open) => {
      state.open = open;
    },
    setPreferredDockMode: (mode) => {
      state.dock = mode;
    },
  });
  return { result, ...state };
}

describe("openCopilotShell", () => {
  it("does not open the companion over a Talk page or dedicated chat chrome", () => {
    expect(
      openShell({ isTalkPage: true, preferredDockMode: "window" })
    ).toEqual({ dock: null, open: false, result: "talk" });
    expect(
      openShell({ chromeHidden: true, preferredDockMode: "sidebar" })
    ).toEqual({ dock: null, open: false, result: "talk" });
  });

  it("restores Window when that was the last companion placement", () => {
    expect(openShell({ preferredDockMode: "window" })).toEqual({
      dock: "window",
      open: true,
      result: "work",
    });
  });

  it("opens Work in the sidebar without a valid stored placement", () => {
    expect(openShell({ preferredDockMode: null })).toEqual({
      dock: "sidebar",
      open: true,
      result: "work",
    });
    expect(openShell({ preferredDockMode: "nope" as "drawer" })).toEqual({
      dock: "sidebar",
      open: true,
      result: "work",
    });
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
  it("keeps the docked blob on dedicated chat chrome", () => {
    // The docked blob is app-bar chrome; the bar must not change shape per page.
    expect(
      shouldShowCopilotFab({
        chromeHidden: true,
        docked: true,
        open: false,
      })
    ).toBe(true);
  });

  it("still hides the floating blob on dedicated chat chrome", () => {
    // It would cover the page's own composer.
    expect(
      shouldShowCopilotFab({
        chromeHidden: true,
        open: false,
      })
    ).toBe(false);
  });

  it("lets a live voice session take the docked slot", () => {
    expect(
      shouldShowCopilotFab({
        docked: true,
        open: false,
        voiceSessionActive: true,
      })
    ).toBe(false);
  });
});
