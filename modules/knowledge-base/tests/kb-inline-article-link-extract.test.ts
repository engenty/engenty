import { describe, expect, it } from "vitest";
import {
  extractKbArticleIdsFromContentJson,
  parseKbArticleIdsFromHref,
} from "../src/services/extract-kb-inline-article-ids-from-content-json.js";

const TARGET = "019de775-c0ed-7dd5-88ac-01e81bf30072";

describe("parseKbArticleIdsFromHref", () => {
  it("parses relative KB article path", () => {
    expect(
      parseKbArticleIdsFromHref(`/mdl/knowledge-base/kb/default/${TARGET}`)
    ).toEqual([TARGET]);
  });

  it("parses absolute URL pathname", () => {
    expect(
      parseKbArticleIdsFromHref(
        `https://engenty.localhost/mdl/knowledge-base/kb/default/${TARGET}`
      )
    ).toEqual([TARGET]);
  });

  it("parses path with trailing /edit", () => {
    expect(
      parseKbArticleIdsFromHref(`/mdl/knowledge-base/kb/default/${TARGET}/edit`)
    ).toEqual([TARGET]);
  });

  it("parses uppercase UUID in path (normalized to lowercase)", () => {
    const upper = TARGET.toUpperCase();
    expect(
      parseKbArticleIdsFromHref(`/mdl/knowledge-base/kb/default/${upper}`)
    ).toEqual([TARGET]);
  });
});

describe("extractKbArticleIdsFromContentJson", () => {
  it("collects ids from TipTap link marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "See also",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: `/mdl/knowledge-base/kb/default/${TARGET}`,
                    target: "_blank",
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const ids = extractKbArticleIdsFromContentJson(doc);
    expect([...ids]).toEqual([TARGET]);
  });
});
