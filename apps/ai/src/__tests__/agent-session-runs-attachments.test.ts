import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { latestUserAttachmentParts } from "../api/attachments/tiered-attachments.js";

function attachmentPart(
  type: "document" | "image",
  filename: string,
  mimeType: string
) {
  return {
    type,
    source: { type: "url", value: `https://x/${filename}`, mimeType },
    metadata: {
      engenty_attachment: {
        filename,
        mimeType,
        size: 10,
        storageKey: `tenants/t1/chat/uploads/1_${filename}`,
      },
    },
  };
}

describe("latestUserAttachmentParts", () => {
  it("keeps non-model files too (they still render in the transcript)", () => {
    const imagePart = attachmentPart("image", "y.png", "image/png");
    const zipPart = attachmentPart("document", "a.zip", "application/zip");
    const parts = latestUserAttachmentParts({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "look" }, imagePart, zipPart],
        },
      ],
    } as unknown as RunAgentInput);
    expect(parts).toEqual([imagePart, zipPart]);
  });
});
