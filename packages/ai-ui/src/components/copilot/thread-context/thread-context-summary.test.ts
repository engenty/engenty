import { describe, expect, it } from "vitest";
import {
  buildThreadContextSummary,
  extractThreadObjects,
  extractThreadSources,
} from "./thread-context-summary.js";

describe("extractThreadSources", () => {
  it("dedupes KB markdown links by URL", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "See [Policy](/kb/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/policy#L1-L2) and [Policy again](/kb/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/policy#L1-L2).",
          },
        ],
      },
    ];
    const sources = extractThreadSources(messages);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe("Policy");
    expect(sources[0]?.url).toContain("/kb/");
  });

  it("collects web_search result URLs", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolName: "web_search",
            state: "output-available",
            output: {
              results: [
                { title: "Example", url: "https://example.com/a" },
                { title: "Example 2", url: "https://example.com/b" },
                { title: "Dup", url: "https://example.com/a" },
              ],
            },
          },
        ],
      },
    ];
    const sources = extractThreadSources(messages);
    expect(sources.map((s) => s.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});

describe("extractThreadObjects", () => {
  it("reads show_objects meta and dedupes by ref", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-show_objects",
            toolName: "show_objects",
            state: "output-available",
            output: {
              _meta: {
                engenty: {
                  object_render: {
                    display: "inline",
                    refs: ["contacts:contact:c1", "contacts:contact:c1"],
                    items: [
                      {
                        ref: "contacts:contact:c1",
                        title: "ACME",
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    ];
    const objects = extractThreadObjects(messages, []);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.title).toBe("ACME");
    expect(objects[0]?.ref).toEqual({
      module: "contacts",
      entity: "contact",
      id: "c1",
    });
  });

  it("upgrades /mdl prose mentions via matchHref", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Look at [ACME](/mdl/contacts/c1) please.",
          },
        ],
      },
    ];
    const objects = extractThreadObjects(messages, [
      {
        matchHref: (pathname) => {
          const m = pathname.match(/^\/mdl\/contacts\/([^/]+)$/);
          if (!m?.[1]) {
            return null;
          }
          return { module: "contacts", entity: "contact", id: m[1] };
        },
        getHref: (ref) => `/mdl/contacts/${ref.id}`,
      },
    ]);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.title).toBe("ACME");
    expect(objects[0]?.href).toBe("/mdl/contacts/c1");
  });
});

describe("buildThreadContextSummary", () => {
  it("isEmpty when nothing is present", () => {
    const summary = buildThreadContextSummary({
      artefacts: [],
      messages: [],
    });
    expect(summary.isEmpty).toBe(true);
  });

  it("is not empty when artefacts exist", () => {
    const summary = buildThreadContextSummary({
      artefacts: [{ id: "a1", title: "Doc", type: "markdown" }],
      messages: [],
    });
    expect(summary.isEmpty).toBe(false);
    expect(summary.artefacts).toHaveLength(1);
  });
});
