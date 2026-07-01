import { describe, expect, it } from "vitest";
import {
  ARTICLE_BUILTIN_COMPACT_PIN_KEYS,
  kbDefaultBuiltinPropertyDefinitions,
  kbMergeArticlePropertyDefinitions,
} from "../src/schema/knowledge-bases.js";

describe("kbDefaultBuiltinPropertyDefinitions", () => {
  it("pins Last edited and Tags in compact article metadata by default", () => {
    const defs = kbDefaultBuiltinPropertyDefinitions();
    const compact = defs
      .filter((def) => def.show_in_compact)
      .map((def) => def.builtin_ref);

    expect(compact).toEqual([...ARTICLE_BUILTIN_COMPACT_PIN_KEYS]);
  });
});

describe("kbMergeArticlePropertyDefinitions", () => {
  it("applies default compact pins for legacy KBs without builtin rows", () => {
    const merged = kbMergeArticlePropertyDefinitions([
      {
        id: "custom-1",
        key: "course-code",
        label: "Course code",
        type: "text",
        order: 0,
      },
    ]);

    expect(
      merged.find((def) => def.builtin_ref === "updated_at")
    ).toMatchObject({ show_in_compact: true });
    expect(merged.find((def) => def.builtin_ref === "tags")).toMatchObject({
      show_in_compact: true,
    });
    expect(
      merged.find((def) => def.builtin_ref === "created_at")
    ).toMatchObject({ show_in_compact: false });
  });
});
