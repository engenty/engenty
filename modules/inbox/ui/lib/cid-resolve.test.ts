import { describe, expect, it } from "vitest";
import {
  cidLookupKeyFromContentId,
  cidLookupKeyFromSrcToken,
} from "./cid-resolve.js";

describe("cid-resolve", () => {
  it("normalizes Content-ID header", () => {
    expect(cidLookupKeyFromContentId("<foo@bar>")).toBe("foo");
    expect(cidLookupKeyFromContentId("abc@host")).toBe("abc");
  });

  it("parses cid src token", () => {
    expect(cidLookupKeyFromSrcToken("cid:part1@host")).toBe("part1");
    expect(cidLookupKeyFromSrcToken("part2")).toBe("part2");
  });
});
