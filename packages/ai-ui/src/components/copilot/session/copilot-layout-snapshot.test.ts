import { describe, expect, it } from "vitest";
import {
  createEmptyCopilotLayoutSnapshot,
  mergeCopilotLayoutSnapshot,
  parseCopilotLayoutSnapshot,
} from "./copilot-layout-snapshot.js";

describe("copilot-layout-snapshot", () => {
  it("merges partial updates without dropping other fields", () => {
    const a = mergeCopilotLayoutSnapshot(
      {
        v: 1,
        open: true,
        preferredDockMode: "floating",
        floatingPosition: { x: 10, y: 20 },
        floatingSize: { width: 400, height: 500 },
      },
      { open: false }
    );
    expect(a.open).toBe(false);
    expect(a.preferredDockMode).toBe("sidebar");
    expect(a.floatingPosition).toEqual({ x: 10, y: 20 });
    expect(a.floatingSize).toEqual({ width: 400, height: 500 });
  });

  it("rejects invalid preferredDockMode in parse", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: true,
      preferredDockMode: "nope",
    });
    expect(s?.preferredDockMode).toBeNull();
  });

  it("reconciles open + collapseToCircle to expanded layout", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: true,
      preferredDockMode: "sidebar",
      collapseToCircle: true,
    });
    expect(s?.open).toBe(true);
    expect(s?.collapseToCircle).toBe(false);
  });

  it("closes a legacy mini-floating avatar into a closed blob", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: true,
      preferredDockMode: "mini-floating",
    });
    expect(s?.preferredDockMode).toBeNull();
    expect(s?.open).toBe(false);
    expect(s?.collapseToCircle).toBe(true);
  });

  it("remaps a stored bottom or floating dock onto Work", () => {
    expect(
      parseCopilotLayoutSnapshot({
        v: 1,
        open: true,
        preferredDockMode: "bottom",
      })?.preferredDockMode
    ).toBe("sidebar");
    expect(
      parseCopilotLayoutSnapshot({
        v: 1,
        open: true,
        preferredDockMode: "floating",
      })?.preferredDockMode
    ).toBe("sidebar");
  });

  it("restores exactly the layout that was saved", () => {
    const saved = mergeCopilotLayoutSnapshot(
      createEmptyCopilotLayoutSnapshot(),
      {
        collapseToCircle: false,
        compactStatusFlapHeight: 320,
        floatingDockedToCorner: false,
        floatingPosition: { x: 120, y: 340 },
        floatingSize: { height: 500, width: 400 },
        open: true,
        preferredDockMode: "window",
        windowRect: { height: 680, width: 520, x: 68, y: 52 },
      }
    );
    expect(
      parseCopilotLayoutSnapshot(JSON.parse(JSON.stringify(saved)))
    ).toEqual(saved);
  });
});
