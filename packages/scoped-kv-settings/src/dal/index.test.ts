import { describe, expect, it } from "vitest";
import { scopedKvContextFilterValue } from "./index.js";

describe("scopedKvContextFilterValue", () => {
  it("serializes JSONB contexts for exact Supabase filters", () => {
    expect(scopedKvContextFilterValue({ kb_id: "kb-1" })).toBe(
      '{"kb_id":"kb-1"}'
    );
  });

  it("keeps the scope-wide context as an exact empty JSON object", () => {
    expect(scopedKvContextFilterValue({})).toBe("{}");
  });
});
