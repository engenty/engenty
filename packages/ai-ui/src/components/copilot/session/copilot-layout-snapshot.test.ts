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

  it("createEmptyCopilotLayoutSnapshot", () => {
    expect(createEmptyCopilotLayoutSnapshot()).toEqual({
      v: 1,
      open: false,
      preferredDockMode: null,
    });
  });

  it("ignores leftover fabPosition and fabAnchor keys on hydrate", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: false,
      preferredDockMode: null,
      fabAnchor: {
        edgeX: "right",
        edgeY: "bottom",
        offsetX: 16,
        offsetY: 16,
      },
      fabPosition: { x: 100, y: 200 },
    });
    expect(s && "fabPosition" in s).toBe(false);
    expect(s && "fabAnchor" in s).toBe(false);
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

  it("parses compactStatusFlapHeight from snapshot", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: false,
      preferredDockMode: null,
      compactStatusFlapHeight: 320,
    });
    expect(s?.compactStatusFlapHeight).toBe(320);
  });

  it("parses and merges floatingDockedToCorner", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: false,
      preferredDockMode: "floating",
      floatingDockedToCorner: false,
      floatingPosition: { x: 120, y: 340 },
    });
    expect(s?.floatingDockedToCorner).toBe(false);
    expect(s?.preferredDockMode).toBe("sidebar");
    expect(s?.floatingPosition).toEqual({ x: 120, y: 340 });

    const merged = mergeCopilotLayoutSnapshot(
      {
        v: 1,
        open: false,
        preferredDockMode: "floating",
        floatingDockedToCorner: true,
        floatingPosition: { x: 10, y: 20 },
      },
      { floatingDockedToCorner: false }
    );
    expect(merged.floatingDockedToCorner).toBe(false);
    expect(merged.floatingPosition).toEqual({ x: 10, y: 20 });
  });
});
