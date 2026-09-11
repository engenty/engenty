/**
 * The one piece of the save route that can silently corrupt a file: turning the
 * body's text back into the bytes it claims to be.
 */
import { describe, expect, it } from "vitest";
import { decodeContent } from "./file-manager-routes.js";

describe("decodeContent", () => {
  it("encodes utf-8 text as its own bytes", () => {
    expect(decodeContent("# Küste\n", "utf-8")).toEqual(
      new TextEncoder().encode("# Küste\n")
    );
  });

  it("counts multi-byte characters as BYTES, not characters", () => {
    // The size cap and `sizeBytes` are both byte counts; treating "Küste" as
    // five would understate every non-ASCII file.
    expect(decodeContent("Küste", "utf-8")?.byteLength).toBe(6);
  });

  it("round-trips base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const encoded = Buffer.from(bytes).toString("base64");
    expect(decodeContent(encoded, "base64")).toEqual(bytes);
  });

  it("accepts base64 that arrived with line breaks", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encoded = Buffer.from(bytes).toString("base64");
    expect(
      decodeContent(`${encoded.slice(0, 4)}\n${encoded.slice(4)}`, "base64")
    ).toEqual(bytes);
  });

  it("REJECTS text that is not base64 instead of writing garbage", () => {
    // `Buffer.from(…, "base64")` happily ignores what it cannot parse, so
    // without the re-encode check this would overwrite a file with rubbish.
    expect(decodeContent("# a markdown heading", "base64")).toBeNull();
    expect(decodeContent("not base64!!", "base64")).toBeNull();
  });

  it("treats empty content as an empty file, not as a failure", () => {
    expect(decodeContent("", "utf-8")).toEqual(new Uint8Array());
    expect(decodeContent("", "base64")).toEqual(new Uint8Array());
  });
});
