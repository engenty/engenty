import { describe, expect, it } from "vitest";
import {
  isLinkableEntityId,
  projectDetailPath,
  taskDetailPath,
} from "./tracking-entity-link.js";

describe("tracking entity links", () => {
  it("accepts UUID entity ids only", () => {
    expect(isLinkableEntityId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true
    );
    expect(isLinkableEntityId("standalone_tasks")).toBe(false);
    expect(isLinkableEntityId("Internal / Tasks")).toBe(false);
    expect(isLinkableEntityId(undefined)).toBe(false);
  });

  it("builds module detail paths", () => {
    expect(projectDetailPath("abc")).toBe("/mdl/projects/abc");
    expect(taskDetailPath("abc/def")).toBe("/mdl/tasks/abc%2Fdef");
  });
});
