import { describe, expect, it } from "vitest";
import {
  iconForArtifactType,
  iconForAttachment,
  iconForObjectRef,
  iconForSourceUrl,
  iconForSubAgent,
} from "./thread-context-icons.js";

describe("thread-context-icons", () => {
  it("maps known artifact types to distinct icons", () => {
    expect(iconForArtifactType("markdown")).not.toBe(
      iconForArtifactType("table")
    );
    expect(iconForArtifactType("html")).not.toBe(iconForArtifactType("app"));
    expect(iconForArtifactType("page")).toBe(iconForArtifactType("markdown"));
    expect(iconForArtifactType("file")).not.toBe(
      iconForArtifactType("markdown")
    );
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

  it("picks image vs file icons for attachments", () => {
    expect(iconForAttachment("image/png", "photo.png")).not.toBe(
      iconForAttachment("application/pdf", "notes.pdf")
    );
    expect(iconForAttachment("application/zip", "archive.zip")).toBeTruthy();
  });

  it("uses a bot icon for sub-agents", () => {
    expect(iconForSubAgent()).toBeTruthy();
  });
});
