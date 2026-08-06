import { describe, expect, it } from "vitest";
import {
  iconForArtifactType,
  iconForObjectRef,
  iconForSourceUrl,
} from "./thread-context-icons.js";

describe("thread-context-icons", () => {
  it("maps known artifact types to distinct icons", () => {
    expect(iconForArtifactType("markdown")).not.toBe(
      iconForArtifactType("table")
    );
    expect(iconForArtifactType("html")).not.toBe(iconForArtifactType("app"));
    expect(iconForArtifactType("mystery")).toBe(
      iconForArtifactType("markdown")
    );
  });

  it("maps common object entities", () => {
    expect(
      iconForObjectRef({ module: "tasks", entity: "task", id: "1" })
    ).not.toBe(
      iconForObjectRef({ module: "projects", entity: "project", id: "1" })
    );
    expect(
      iconForObjectRef({ module: "misc", entity: "thing", id: "1" })
    ).toBeTruthy();
  });

  it("picks book for kb and globe for external", () => {
    expect(iconForSourceUrl("/kb/abc/slug")).not.toBe(
      iconForSourceUrl("https://example.com")
    );
  });
});
