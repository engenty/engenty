import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  classifyAttachmentTier,
  collectThreadUserAttachments,
  INLINE_TEXT_MAX_BYTES,
  latestUserAttachments,
} from "../api/attachments/tiered-attachments.js";

function runInput(messages: unknown[]): RunAgentInput {
  return { messages } as unknown as RunAgentInput;
}

const csvPart = {
  type: "document",
  source: {
    type: "url",
    value: "https://x/a.csv",
    mimeType: "text/csv",
  },
  metadata: {
    engenty_attachment: {
      filename: "customers.csv",
      mimeType: "text/csv",
      size: 1200,
      storageKey: "tenants/t1/chat/uploads/1_customers.csv",
    },
  },
};

// PDFs and office docs never go to the model as native bytes (token limiter);
// text inlines up to the 32 KiB budget and goes tool-backed beyond it.
describe("classifyAttachmentTier", () => {
  it.each([
    {
      byteLength: 99,
      filename: "x.png",
      mimeType: "image/png",
      tier: "model_native",
    },
    {
      byteLength: 99,
      filename: "x.pdf",
      mimeType: "application/pdf",
      tier: "tool_backed",
    },
    {
      byteLength: INLINE_TEXT_MAX_BYTES,
      filename: "customers.csv",
      mimeType: "text/csv",
      tier: "inline_text",
    },
    {
      byteLength: INLINE_TEXT_MAX_BYTES + 1,
      filename: "big.csv",
      mimeType: "text/csv",
      tier: "tool_backed",
    },
  ])("$mimeType at $byteLength bytes → $tier", ({ tier, ...input }) => {
    expect(classifyAttachmentTier(input)).toBe(tier);
  });
});

describe("latestUserAttachments", () => {
  it("includes sizeBytes from engenty_attachment metadata", () => {
    const refs = latestUserAttachments(
      runInput([{ role: "user", content: [csvPart] }])
    );
    expect(refs).toEqual([
      {
        filename: "customers.csv",
        mimeType: "text/csv",
        sizeBytes: 1200,
        storageKey: "tenants/t1/chat/uploads/1_customers.csv",
      },
    ]);
  });
});

describe("collectThreadUserAttachments", () => {
  it("keeps a prior PDF when the latest user turn is text-only", () => {
    const pdfPart = {
      type: "document",
      source: {
        mimeType: "application/pdf",
        type: "url",
        value: "https://x/notes.pdf",
      },
      metadata: {
        engenty_attachment: {
          extractedBy: "anydoc",
          extractedMarkdown: "Attersee 22 °C",
          filename: "notes.pdf",
          mimeType: "application/pdf",
          size: 80_000,
          storageKey: "tenants/t1/chat/uploads/1_notes.pdf",
        },
      },
    };
    const refs = collectThreadUserAttachments(
      runInput([
        { role: "user", content: [pdfPart] },
        { role: "assistant", content: "ok" },
        { role: "user", content: [{ type: "text", text: "search the pdf" }] },
      ])
    );
    expect(refs).toEqual([
      {
        extractedBy: "anydoc",
        extractedMarkdown: "Attersee 22 °C",
        filename: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 80_000,
        storageKey: "tenants/t1/chat/uploads/1_notes.pdf",
      },
    ]);
  });

  it("reads attachment parts from stored thread rows", () => {
    const refs = collectThreadUserAttachments(
      runInput([
        {
          parts: [
            {
              metadata: {
                engenty_attachment: {
                  filename: "notes.pdf",
                  mimeType: "application/pdf",
                  size: 12,
                  storageKey: "tenants/t1/chat/notes.pdf",
                },
              },
              source: {
                mimeType: "application/pdf",
                type: "url",
                value: "https://x/notes.pdf",
              },
              type: "document",
            },
          ],
          role: "user",
        },
      ])
    );
    expect(refs[0]?.storageKey).toBe("tenants/t1/chat/notes.pdf");
  });
});
