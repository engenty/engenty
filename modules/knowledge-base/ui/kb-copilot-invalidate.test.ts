import { describe, expect, it } from "vitest";
import { extractKbArticleIdFromPathname } from "./kb-copilot-invalidate.js";

describe("extractKbArticleIdFromPathname", () => {
  const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

  it("reads scoped KB article view and edit paths", () => {
    expect(extractKbArticleIdFromPathname(`/mdl/knowledge-base/x/${id}`)).toBe(
      id
    );
    expect(
      extractKbArticleIdFromPathname(`/mdl/knowledge-base/x/${id}/edit`)
    ).toBe(id);
  });

  it("reads legacy flat article paths", () => {
    expect(extractKbArticleIdFromPathname(`/mdl/knowledge-base/${id}`)).toBe(
      id
    );
    expect(
      extractKbArticleIdFromPathname(`/mdl/knowledge-base/${id}/edit`)
    ).toBe(id);
  });

  it("returns null when no article id segment", () => {
    expect(
      extractKbArticleIdFromPathname("/mdl/knowledge-base/x/articles")
    ).toBeNull();
    expect(
      extractKbArticleIdFromPathname("/mdl/knowledge-base/articles")
    ).toBeNull();
  });
});
