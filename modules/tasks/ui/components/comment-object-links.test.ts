import { describe, expect, it } from "vitest";
import { linkifyObjectRefs } from "./comment-object-links.js";

const CONTACT_ID = "019f8f2d-01a6-7625-a4ad-f88ecbec95f8";

describe("linkifyObjectRefs", () => {
  it("returns the original string untouched when there is no ref", () => {
    const text = "Created the contact and added a welcome note.";
    expect(linkifyObjectRefs(text)).toBe(text);
  });

  it("splits a ref out of surrounding prose", () => {
    const nodes = linkifyObjectRefs(
      `Created contacts:contact:${CONTACT_ID} for the campaign.`
    );
    expect(Array.isArray(nodes)).toBe(true);
    const parts = nodes as unknown[];
    expect(parts[0]).toBe("Created ");
    expect(parts.at(-1)).toBe(" for the campaign.");
    // The middle node is the rendered chip element, not raw text.
    expect(typeof parts[1]).toBe("object");
  });

  it("linkifies several refs in one comment", () => {
    const second = "019f8f1b-92b5-7e6c-ba04-07b73da83b7b";
    const nodes = linkifyObjectRefs(
      `contacts:contact:${CONTACT_ID} and tasks:task:${second}`
    );
    const elements = (nodes as unknown[]).filter(
      (node) => typeof node === "object"
    );
    expect(elements).toHaveLength(2);
  });

  it("ignores a bare uuid with no module/entity prefix", () => {
    const text = `ID: ${CONTACT_ID}`;
    expect(linkifyObjectRefs(text)).toBe(text);
  });

  it("ignores prose that merely contains colons", () => {
    const text = "Status: created, Result: ok";
    expect(linkifyObjectRefs(text)).toBe(text);
  });
});
