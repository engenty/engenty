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
    expect(a.preferredDockMode).toBe("floating");
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

  it("parses fabPosition from snapshot", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: false,
      preferredDockMode: null,
      fabPosition: { x: 100, y: 200 },
    });
    expect(s?.fabPosition).toEqual({ x: 100, y: 200 });
  });

  it("ignores invalid fabPosition", () => {
    const s = parseCopilotLayoutSnapshot({
      v: 1,
      open: false,
      preferredDockMode: null,
      fabPosition: { x: "bad", y: 200 },
    });
    expect(s?.fabPosition).toBeUndefined();
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

  it("merges fabPosition", () => {
    const base = mergeCopilotLayoutSnapshot(
      { v: 1, open: false, preferredDockMode: null },
      { fabPosition: { x: 50, y: 60 } }
    );
    expect(base.fabPosition).toEqual({ x: 50, y: 60 });

    const cleared = mergeCopilotLayoutSnapshot(base, {
      fabPosition: undefined,
    });
    expect(cleared.fabPosition).toEqual({ x: 50, y: 60 });
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
});
