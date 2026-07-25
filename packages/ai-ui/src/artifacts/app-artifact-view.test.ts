import { describe, expect, it } from "vitest";
import { parseAppHandle } from "./app-artifact-view.js";
import { resolveArtifactRenderer } from "./artifact-renderers.js";

describe("parseAppHandle", () => {
  it("reads a well-formed handle", () => {
    expect(
      parseAppHandle(
        JSON.stringify({
          app_id: "a-1",
          app_version: 3,
          session_id: "s-1",
        })
      )
    ).toEqual({ app_id: "a-1", app_version: 3, session_id: "s-1" });
  });

  it("omits app_version when absent so the active release is used", () => {
    const handle = parseAppHandle(
      JSON.stringify({ app_id: "a-1", session_id: "s-1" })
    );
    expect(handle).toEqual({ app_id: "a-1", session_id: "s-1" });
    expect(handle && "app_version" in handle).toBe(false);
  });

  it.each([
    ["null content", null],
    ["empty string", ""],
    ["not json", "{nope"],
    ["missing app_id", JSON.stringify({ session_id: "s-1" })],
    ["missing session_id", JSON.stringify({ app_id: "a-1" })],
    ["wrong types", JSON.stringify({ app_id: 1, session_id: 2 })],
  ])("returns null for %s", (_label, content) => {
    expect(parseAppHandle(content)).toBeNull();
  });
});

describe("app artifact renderer registration", () => {
  it("resolves a renderer for the app type", () => {
    expect(resolveArtifactRenderer("app")).not.toBeNull();
  });

  it("leaves the built-in types intact", () => {
    expect(resolveArtifactRenderer("markdown")).not.toBeNull();
    expect(resolveArtifactRenderer("html")).not.toBeNull();
    expect(resolveArtifactRenderer("table")).not.toBeNull();
  });
});
