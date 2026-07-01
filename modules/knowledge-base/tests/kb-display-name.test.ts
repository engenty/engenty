import { describe, expect, it } from "vitest";
import { kbDisplayName } from "../ui/kb-display-name.js";

const t = (key: string) => {
  if (key === "hub.default_kb_label") {
    return "Knowledge Base";
  }
  return key;
};

describe("kbDisplayName", () => {
  it("returns the localized label when name is the seeded sentinel", () => {
    expect(
      kbDisplayName({ name: "Default", slug: "default", is_default: true }, t)
    ).toBe("Knowledge Base");
  });

  it("returns the localized label when name is empty / whitespace", () => {
    expect(
      kbDisplayName({ name: "", slug: "default", is_default: true }, t)
    ).toBe("Knowledge Base");
    expect(
      kbDisplayName({ name: "   ", slug: "default", is_default: true }, t)
    ).toBe("Knowledge Base");
  });

  it("honors a user-provided name even on the seeded default KB", () => {
    // Once the user renames the seeded default KB, its custom name must win
    // over the localized fallback — otherwise the rename would be invisible.
    expect(
      kbDisplayName(
        { name: "WAFF Pressemitteilungen", slug: "default", is_default: true },
        t
      )
    ).toBe("WAFF Pressemitteilungen");
  });

  it("trims surrounding whitespace from the displayed name", () => {
    expect(
      kbDisplayName({ name: "  My KB  ", slug: "my-kb", is_default: false }, t)
    ).toBe("My KB");
  });

  it("returns the raw name for any non-default KB", () => {
    expect(
      kbDisplayName(
        { name: "Engineering", slug: "engineering", is_default: false },
        t
      )
    ).toBe("Engineering");
  });
});
