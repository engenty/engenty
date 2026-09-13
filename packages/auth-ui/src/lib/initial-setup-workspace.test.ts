import { describe, expect, it } from "vitest";
import {
  firstSpaceKey,
  mountsToSetupPayload,
  slugifyName,
} from "./initial-setup-workspace";

describe("slugifyName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyName("Acme Inc.")).toBe("acme-inc");
  });

  it("drops leading and trailing separators", () => {
    expect(slugifyName("  — Acme — ")).toBe("acme");
  });

  it("is empty for a name with nothing sluggable in it", () => {
    expect(slugifyName("—")).toBe("");
  });

  // 48 is the column limit the tenant slug is stored under; a name cut mid-word
  // must not leave the trailing hyphen a slug may not end with.
  it("caps the length without ending on a hyphen", () => {
    const slug = slugifyName(`${"a".repeat(47)} b`);
    expect(slug).toHaveLength(47);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("mountsToSetupPayload", () => {
  it("renames the wire fields and keeps the whole set", () => {
    expect(
      mountsToSetupPayload([
        {
          agentAccess: "none",
          recordScope: "space",
          resourceKey: "engenty-copilot",
          resourceType: "module",
        },
        {
          agentAccess: null,
          recordScope: null,
          resourceKey: "engenty.copilot",
          resourceType: "agent",
        },
      ])
    ).toEqual([
      {
        agent_access: "none",
        record_scope: "space",
        resource_key: "engenty-copilot",
        resource_type: "module",
      },
      { resource_key: "engenty.copilot", resource_type: "agent" },
    ]);
  });
});

describe("firstSpaceKey", () => {
  it("keys the space off its name", () => {
    expect(firstSpaceKey("Acme Inc.", [])).toBe("acme-inc");
  });

  it("falls back when the name slugifies to nothing", () => {
    expect(firstSpaceKey("—", [])).toBe("space");
  });

  it("steps past a key the tenant already holds", () => {
    expect(firstSpaceKey("Acme", ["acme", "acme-2"])).toBe("acme-3");
  });

  // `spaces_key_format_check` caps the key at 63 characters.
  it("stays inside the key length limit", () => {
    expect(firstSpaceKey("a".repeat(80), []).length).toBeLessThanOrEqual(60);
  });
});
