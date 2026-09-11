import { describe, expect, it } from "vitest";
import {
  getCopilotTranscriptScrollTop,
  isCopilotScrollViewportNearBottom,
  resolveCopilotEmptyLandingAlign,
  resolveCopilotTranscriptBottomPaddingClass,
  shouldCenterCopilotEmptyLanding,
} from "./copilot-panel-content";

describe("CopilotPanelContent scroll helpers", () => {
  it("treats the viewport as sticky when it is near the bottom", () => {
    expect(
      isCopilotScrollViewportNearBottom({
        clientHeight: 500,
        scrollHeight: 1000,
        scrollTop: 410,
      })
    ).toBe(true);
  });

  it("does not force-scroll after the user scrolls away from the bottom", () => {
    expect(
      isCopilotScrollViewportNearBottom({
        clientHeight: 500,
        scrollHeight: 1000,
        scrollTop: 250,
      })
    ).toBe(false);
  });

  it("scrolls to the true bottom of the viewport", () => {
    expect(
      getCopilotTranscriptScrollTop({
        clientHeight: 500,
        scrollHeight: 1000,
      })
    ).toBe(500);
  });

  it("adds extra bottom safe space while streaming on docked composer", () => {
    expect(
      resolveCopilotTranscriptBottomPaddingClass({
        compact: false,
        composerDockStyle: true,
        status: "streaming",
      })
    ).toBe("pb-40");
    expect(
      resolveCopilotTranscriptBottomPaddingClass({
        compact: false,
        composerDockStyle: true,
        status: "ready",
      })
    ).toBe("pb-20");
  });

  it("centers the empty landing only for body-only dock composer surfaces", () => {
    expect(
      shouldCenterCopilotEmptyLanding({
        bodyOnly: true,
        composerDockStyle: true,
        showEmptyLanding: true,
      })
    ).toBe(true);
    expect(
      shouldCenterCopilotEmptyLanding({
        bodyOnly: false,
        composerDockStyle: true,
        showEmptyLanding: true,
      })
    ).toBe(false);
  });

  it("pins specialist desks to a top-aligned empty landing", () => {
    expect(
      resolveCopilotEmptyLandingAlign({
        bodyOnly: true,
        composerDockStyle: true,
        emptyLandingAlign: "start",
        showEmptyLanding: true,
      })
    ).toBe("start");
    expect(
      resolveCopilotEmptyLandingAlign({
        bodyOnly: true,
        composerDockStyle: true,
        showEmptyLanding: true,
      })
    ).toBe("center");
    expect(
      resolveCopilotEmptyLandingAlign({
        bodyOnly: true,
        composerDockStyle: true,
        emptyLandingAlign: "start",
        showEmptyLanding: false,
      })
    ).toBeUndefined();
  });
});
