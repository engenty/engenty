import { describe, expect, it } from "vitest";

import { readAgUiBrowserPreview } from "../engenty-browser-preview.js";

const window = { agent_id: "maggie", space_id: "space-1" };
const shot = {
  ...window,
  annotations: [],
  height: 720,
  image: "data:image/jpeg;base64,AAAA",
  kind: "browser_screenshot",
  width: 1280,
};

describe("readAgUiBrowserPreview", () => {
  it("reads the live view and the setup of an agent's window", () => {
    expect(
      readAgUiBrowserPreview({ ...window, kind: "browser", mode: "live" })
    ).toEqual({ ...window, kind: "browser", mode: "live" });
    expect(
      readAgUiBrowserPreview({ ...window, kind: "browser", mode: "setup" })
    ).toEqual({ ...window, kind: "browser", mode: "setup" });
  });

  it("only takes a screenshot the server inlined, never a URL to fetch", () => {
    expect(readAgUiBrowserPreview(shot)?.kind).toBe("browser_screenshot");
    expect(
      readAgUiBrowserPreview({
        ...shot,
        image: "https://attacker.example/x.png",
      })
    ).toBeNull();
  });

  it("drops marks it cannot place and keeps the rest", () => {
    const preview = readAgUiBrowserPreview({
      ...shot,
      annotations: [
        { height: 20, label: "Sign in", shape: "box", width: 80, x: 10, y: 10 },
        { label: "no position" },
      ],
    });
    expect(
      preview?.kind === "browser_screenshot" ? preview.annotations : null
    ).toEqual([
      {
        color: "red",
        height: 20,
        label: "Sign in",
        shape: "box",
        width: 80,
        x: 10,
        y: 10,
      },
    ]);
  });

  it("is not a browser preview without the window it belongs to, or for a workflow", () => {
    expect(
      readAgUiBrowserPreview({ kind: "browser", mode: "live" })
    ).toBeNull();
    expect(readAgUiBrowserPreview({ graph: {}, kind: "workflow" })).toBeNull();
  });
});
