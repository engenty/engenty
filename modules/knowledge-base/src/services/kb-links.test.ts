import { describe, expect, it } from "vitest";
import { createKbLinks, kbSpacePath } from "./kb-links.js";

describe("kb-links", () => {
  it("links every record into the KB's space", () => {
    const links = createKbLinks({ spaceKey: "brain" });
    expect(links.hub()).toBe("/s/brain/kb");
    expect(links.article("01a0-art")).toBe("/s/brain/kb/01a0-art");
    expect(links.faq("faq-1")).toBe("/s/brain/kb/faqs/faq-1");
    expect(links.source("src-1")).toBe("/s/brain/kb/sources/src-1");
    expect(links.category("general")).toBe("/s/brain/kb/c/general");
  });

  it("falls back to the /mdl form when the space key is unknown", () => {
    const links = createKbLinks({ spaceKey: null });
    expect(links.article("a1")).toBe("/mdl/knowledge-base/a1");
  });

  it("encodes the space key and leaves non-module paths alone", () => {
    expect(kbSpacePath("a b", "/mdl/knowledge-base/x")).toBe("/s/a%20b/kb/x");
    expect(kbSpacePath("brain", "/settings/knowledge-base")).toBe(
      "/settings/knowledge-base"
    );
  });
});
