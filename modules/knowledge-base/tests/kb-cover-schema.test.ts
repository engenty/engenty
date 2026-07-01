import { describe, expect, it } from "vitest";
import { kbCoverSchema } from "../src/schema/knowledge-bases.js";

describe("kbCoverSchema", () => {
  it("parses image with optional Unsplash source", () => {
    const parsed = kbCoverSchema.parse({
      type: "image",
      value: "tenants/t1/knowledge-base/my-kb/covers/1700000000000_1.jpg",
      source: {
        kind: "unsplash",
        photographer_name: "Jane",
        photographer_url: "https://unsplash.com/@jane",
        photo_url: "https://unsplash.com/photos/abc",
      },
    });
    expect(parsed.type).toBe("image");
    if (parsed.type === "image") {
      expect(parsed.source?.kind).toBe("unsplash");
      expect(parsed.source?.photographer_name).toBe("Jane");
    }
  });

  it("parses image without source", () => {
    const parsed = kbCoverSchema.parse({
      type: "image",
      value: "https://example.com/a.png",
    });
    expect(parsed.type).toBe("image");
    if (parsed.type === "image") {
      expect(parsed.source).toBeUndefined();
    }
  });
});
