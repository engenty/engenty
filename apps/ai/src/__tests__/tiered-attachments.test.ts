import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  classifyAttachmentTier,
  formatAttachmentManifestEntry,
  INLINE_TEXT_MAX_BYTES,
  isModelFeedableMime,
  isTextLikeAttachment,
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

describe("tiered attachment classification", () => {
  it("keeps images/PDFs as model_native", () => {
    expect(
      classifyAttachmentTier({
        byteLength: 99,
        mimeType: "image/png",
        filename: "x.png",
      })
    ).toBe("model_native");
    expect(
      classifyAttachmentTier({
        byteLength: 99,
        mimeType: "application/pdf",
        filename: "x.pdf",
      })
    ).toBe("model_native");
    expect(isModelFeedableMime("text/csv")).toBe(false);
  });

  it("inlines small text/CSV under the 32KiB budget", () => {
    expect(isTextLikeAttachment("text/csv", "customers.csv")).toBe(true);
    expect(
      classifyAttachmentTier({
        byteLength: 1024,
        mimeType: "text/csv",
        filename: "customers.csv",
      })
    ).toBe("inline_text");
    expect(
      classifyAttachmentTier({
        byteLength: INLINE_TEXT_MAX_BYTES,
        mimeType: "application/json",
        filename: "data.json",
      })
    ).toBe("inline_text");
  });

  it("routes oversized text and binaries to tool_backed", () => {
    expect(
      classifyAttachmentTier({
        byteLength: INLINE_TEXT_MAX_BYTES + 1,
        mimeType: "text/csv",
        filename: "big.csv",
      })
    ).toBe("tool_backed");
    expect(
      classifyAttachmentTier({
        byteLength: 50,
        mimeType: "application/zip",
        filename: "a.zip",
      })
    ).toBe("tool_backed");
  });

  it("detects text-like by extension when mime is generic", () => {
    expect(isTextLikeAttachment("application/octet-stream", "export.csv")).toBe(
      true
    );
    expect(
      classifyAttachmentTier({
        byteLength: 200,
        mimeType: "application/octet-stream",
        filename: "export.csv",
      })
    ).toBe("inline_text");
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

describe("formatAttachmentManifestEntry", () => {
  it("mentions file_analyst for tool_backed feeds", () => {
    const text = formatAttachmentManifestEntry({
      filename: "big.csv",
      mimeType: "text/csv",
      sizeBytes: 99_000,
      storageKey: "tenants/t1/chat/uploads/big.csv",
      tier: "tool_backed",
      body: "a;b\n1;2\n",
      truncated: true,
    });
    expect(text).toContain("agent-file_analyst");
    expect(text).toContain("storage_key: tenants/t1/chat/uploads/big.csv");
    expect(text).toContain("Preview (truncated)");
  });

  it("marks inline content clearly", () => {
    const text = formatAttachmentManifestEntry({
      filename: "small.csv",
      mimeType: "text/csv",
      sizeBytes: 20,
      storageKey: "tenants/t1/chat/uploads/small.csv",
      tier: "inline_text",
      body: "id;name\n1;Ada\n",
    });
    expect(text).toContain("fully inlined");
    expect(text).toContain("id;name");
  });
});
