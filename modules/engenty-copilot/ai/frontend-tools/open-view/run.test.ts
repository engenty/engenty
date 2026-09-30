import { describe, expect, it, vi } from "vitest";
import { runOpenViewFrontendTool } from "./run.js";

function deps(
  overrides: Partial<Parameters<typeof runOpenViewFrontendTool>[1]> = {}
) {
  return {
    navigate: vi.fn(),
    openInPane: vi.fn(() => true),
    ...overrides,
  };
}

describe("open_view", () => {
  it("opens in the desk's pane and reports the frame", () => {
    const d = deps();
    const result = runOpenViewFrontendTool(
      { expanded: true, path: "/s/engrd/contacts/import?file=k&name=a.csv" },
      d
    );
    expect(result).toEqual({
      frame: "pane",
      ok: true,
      path: "/s/engrd/contacts/import?file=k&name=a.csv",
    });
    expect(d.openInPane).toHaveBeenCalledWith(
      { path: "/s/engrd/contacts/import?file=k&name=a.csv" },
      { expanded: true }
    );
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it("becomes the main page when no desk shows a pane", () => {
    const d = deps({ openInPane: vi.fn(() => false) });
    const result = runOpenViewFrontendTool({ path: "/s/engrd/contacts" }, d);
    expect(result.frame).toBe("page");
    expect(d.navigate).toHaveBeenCalledWith("/s/engrd/contacts");
  });

  it.each([
    "https://evil.example/x",
    "//evil.example/x",
    "contacts/import",
  ])("refuses %s", (path) => {
    const d = deps();
    expect(() => runOpenViewFrontendTool({ path }, d)).toThrow();
    expect(d.openInPane).not.toHaveBeenCalled();
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it("refuses a path no route renders instead of opening an empty pane", () => {
    const d = deps({ pathMatches: () => false });
    expect(() => runOpenViewFrontendTool({ path: "/s/engrd/nope" }, d)).toThrow(
      /No page is registered/
    );
    expect(d.openInPane).not.toHaveBeenCalled();
  });
});
