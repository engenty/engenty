import { describe, expect, it } from "vitest";
import { splitDocument } from "./splitter.js";
import { makeDocument } from "./test-utils.js";

describe("splitDocument", () => {
  it("mode none wraps the whole text as chunk 0", async () => {
    const chunks = await splitDocument(
      { mode: "none" },
      makeDocument({ text: "  full body  " })
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunk_index: 0,
      doc_id: "doc-1",
      text: "full body",
    });
    expect(chunks[0]?.chunk_id).toContain("doc-1");
  });

  it("empty text yields no chunks (caller deletes the index entry)", async () => {
    expect(
      await splitDocument({ mode: "none" }, makeDocument({ text: "   " }))
    ).toEqual([]);
  });

  it("fixed mode slices long text into multiple chunks", async () => {
    const chunks = await splitDocument(
      { max_chunk_length: 10, mode: "fixed" },
      makeDocument({ text: "abcdefghij0123456789xyz" })
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(
      chunks.map((_, index) => index)
    );
  });

  it("paragraph mode groups paragraphs", async () => {
    const chunks = await splitDocument(
      { max_chunk_length: 20, mode: "paragraph" },
      makeDocument({ text: "first para\n\nsecond para\n\nthird para" })
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.text).toContain("first para");
  });

  it("custom splitter passes through verbatim", async () => {
    const chunks = await splitDocument(
      {
        mode: "custom",
        split: (document) =>
          Promise.resolve([
            {
              chunk_id: `${document.doc_id}::chunk::0`,
              chunk_index: 0,
              doc_id: document.doc_id,
              text: "custom",
            },
          ]),
      },
      makeDocument()
    );
    expect(chunks).toEqual([
      {
        chunk_id: "doc-1::chunk::0",
        chunk_index: 0,
        doc_id: "doc-1",
        text: "custom",
      },
    ]);
  });
});
