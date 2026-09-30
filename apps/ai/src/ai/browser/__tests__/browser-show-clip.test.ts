import { describe, expect, it, vi } from "vitest";

// The clip is pure; the tool module's browser imports are not needed here.
vi.mock("@mastra/agent-browser", () => ({ AgentBrowser: class {} }));

import { screenshotClip } from "../browser-show-tool.js";

// A narrow, tall pane makes the page 1280 wide and 1600 high.
const tallPage = { height: 1600, width: 1280 };

describe("screenshotClip", () => {
  it("shows the band around the marks, not a mostly blank tall page", () => {
    const clip = screenshotClip(tallPage, [
      { height: 30, y: 240 },
      { height: 20, y: 340 },
    ]);
    expect(clip.y).toBeLessThanOrEqual(240);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(360);
    expect(clip.height).toBeLessThanOrEqual(1280 * 0.75);
    expect(clip.width).toBe(1280);
  });

  it("keeps every mark in the frame even when they span more than the cap", () => {
    const clip = screenshotClip(tallPage, [
      { height: 20, y: 40 },
      { height: 20, y: 1500 },
    ]);
    expect(clip.y).toBeLessThanOrEqual(40);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(1520);
  });

  it("shows the top of the page when nothing is marked", () => {
    expect(screenshotClip(tallPage, [])).toEqual({
      height: 960,
      width: 1280,
      x: 0,
      y: 0,
    });
  });

  it("never leaves the viewport", () => {
    const clip = screenshotClip({ height: 700, width: 1280 }, [
      { height: 40, y: 650 },
    ]);
    expect(clip.y).toBeGreaterThanOrEqual(0);
    expect(clip.y + clip.height).toBeLessThanOrEqual(700);
  });
});
