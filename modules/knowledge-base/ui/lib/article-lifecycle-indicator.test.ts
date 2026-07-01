import { describe, expect, it } from "vitest";
import { resolveArticleLifecycleIndicator } from "./article-lifecycle-indicator.js";

describe("resolveArticleLifecycleIndicator", () => {
  it("prefers locked over approved", () => {
    expect(
      resolveArticleLifecycleIndicator({
        status: "published",
        locked_at: "2026-01-01T00:00:00.000Z",
      }).kind
    ).toBe("locked");
  });

  it("maps published to approved visual", () => {
    expect(
      resolveArticleLifecycleIndicator({
        status: "published",
        locked_at: null,
      }).kind
    ).toBe("approved");
  });

  it("maps draft status", () => {
    expect(
      resolveArticleLifecycleIndicator({
        status: "draft",
        locked_at: null,
      }).kind
    ).toBe("draft");
  });
});
