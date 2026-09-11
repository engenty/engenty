import { describe, expect, it } from "vitest";
import {
  buildChatAttachmentPart,
  type ChatAttachmentMeta,
  isImageMimeType,
  isPdfMimeType,
  readChatAttachmentPart,
} from "./chat-attachment-part.js";

const imageMeta: ChatAttachmentMeta = {
  filename: "photo.png",
  mimeType: "image/png",
  size: 1234,
  storageKey: "tenants/t1/chat/uploads/1700000000000_photo.png",
};

describe("chat-attachment-part", () => {
  it("classifies images vs other files", () => {
    expect(isImageMimeType("image/jpeg")).toBe(true);
    expect(isImageMimeType("application/pdf")).toBe(false);
    expect(isImageMimeType(undefined)).toBe(false);
  });

  it("classifies PDFs by mime or filename", () => {
    expect(isPdfMimeType("application/pdf")).toBe(true);
    expect(isPdfMimeType("APPLICATION/PDF")).toBe(true);
    expect(isPdfMimeType("application/octet-stream", "report.pdf")).toBe(true);
    expect(isPdfMimeType("application/zip", "archive.zip")).toBe(false);
    expect(isPdfMimeType(undefined)).toBe(false);
  });

  it("builds an image part with url source + engenty metadata", () => {
    const part = buildChatAttachmentPart({
      meta: imageMeta,
      url: "https://signed.example/photo.png",
    });
    expect(part).toEqual({
      type: "image",
      source: {
        type: "url",
        value: "https://signed.example/photo.png",
        mimeType: "image/png",
      },
      metadata: { engenty_attachment: imageMeta },
    });
  });

  it("builds a document part for non-image files (e.g. PDF)", () => {
    const part = buildChatAttachmentPart({
      meta: {
        ...imageMeta,
        filename: "report.pdf",
        mimeType: "application/pdf",
      },
      url: "https://signed.example/report.pdf",
    });
    expect(part.type).toBe("document");
  });

  it("round-trips through read", () => {
    const part = buildChatAttachmentPart({
      meta: imageMeta,
      url: "https://signed.example/photo.png",
    });
    expect(readChatAttachmentPart(part)).toEqual({
      ...imageMeta,
      url: "https://signed.example/photo.png",
    });
  });

  it("reads a bare image/document part that lacks engenty metadata", () => {
    const bare = {
      type: "image",
      source: { type: "url", value: "https://x/y.png", mimeType: "image/png" },
    };
    expect(readChatAttachmentPart(bare)).toEqual({
      filename: "",
      mimeType: "image/png",
      size: 0,
      storageKey: "",
      url: "https://x/y.png",
    });
  });

  it("ignores non-attachment parts", () => {
    expect(readChatAttachmentPart({ type: "text", text: "hi" })).toBeNull();
    expect(readChatAttachmentPart(null)).toBeNull();
    expect(readChatAttachmentPart({ type: "image" })).toBeNull();
  });
});
