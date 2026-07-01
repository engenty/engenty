import { describe, expect, it } from "vitest";
import { deriveKbSearchQueryVariants } from "../src/services/kb-search-query.js";

describe("deriveKbSearchQueryVariants", () => {
  it("includes full query and unicode tokens", () => {
    const v = deriveKbSearchQueryVariants("eine Anleitung zu 3D-Software");
    expect(v[0]).toBe("eine Anleitung zu 3D-Software");
    expect(v).toContain("eine");
    expect(v).toContain("Anleitung");
    expect(v).toContain("zu");
    expect(v).toContain("3D");
    expect(v).toContain("Software");
  });

  it("dedupes case-insensitively", () => {
    const v = deriveKbSearchQueryVariants("Foo foo");
    expect(v.filter((x) => x.toLowerCase() === "foo").length).toBe(1);
  });
});
