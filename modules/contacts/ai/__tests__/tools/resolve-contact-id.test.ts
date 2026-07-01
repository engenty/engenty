import { describe, expect, it } from "vitest";
import { resolveScopedContactId } from "../../tools/resolve-contact-id.js";

describe("resolveScopedContactId", () => {
  it("uses the scoped contact when no id is provided", () => {
    expect(resolveScopedContactId(undefined, { entityId: "contact-1" })).toBe(
      "contact-1"
    );
  });

  it('treats "current" as the scoped contact id', () => {
    expect(resolveScopedContactId("current", { entityId: "contact-1" })).toBe(
      "contact-1"
    );
    expect(resolveScopedContactId(" CURRENT ", { entityId: "contact-1" })).toBe(
      "contact-1"
    );
  });

  it("keeps explicit ids intact", () => {
    expect(resolveScopedContactId("contact-2", { entityId: "contact-1" })).toBe(
      "contact-2"
    );
  });
});
