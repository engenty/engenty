/** @vitest-environment happy-dom */
// Chat image and PDF attachments must open an in-app preview (close + download),
// not navigate the browser to the signed URL. Other file tiles still link out.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatAttachmentPart } from "../../../lib/chat-attachment-part.js";

vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === "copilot.attachments.preview") {
        return `Preview ${vars?.name ?? ""}`;
      }
      if (key === "copilot.attachments.download") {
        return "Download";
      }
      if (key === "copilot.attachments.zoomIn") {
        return "Zoom in";
      }
      if (key === "copilot.attachments.zoomOut") {
        return "Zoom out";
      }
      if (key === "copilot.attachments.copy") {
        return "Copy";
      }
      if (key === "actions.close") {
        return "Close";
      }
      if (key === "copilot.attachments.untitledImage") {
        return "image";
      }
      if (key === "copilot.attachments.untitledFile") {
        return "file";
      }
      return key;
    },
  }),
}));

// about:blank keeps the PDF preview's iframe from fetching anything.
vi.mock("../../../lib/file-storage-signed-url.js", () => ({
  getFileStorageSignedUrl: vi.fn(async (key: string) => `about:blank#${key}`),
}));

const { CopilotAttachmentPreview } = await import(
  "./copilot-attachment-preview.js"
);

const IMAGE_URL = "https://cdn.example/shot.png";
const FILE_URL = "https://cdn.example/notes.pdf";

const imagePart = buildChatAttachmentPart({
  meta: {
    filename: "shot.png",
    mimeType: "image/png",
    size: 1200,
    storageKey: "tenants/t1/chat/shot.png",
  },
  url: IMAGE_URL,
});

const filePart = buildChatAttachmentPart({
  meta: {
    filename: "notes.pdf",
    mimeType: "application/pdf",
    size: 2400,
    storageKey: "tenants/t1/chat/notes.pdf",
  },
  url: FILE_URL,
});

afterEach(() => {
  cleanup();
});

describe("CopilotAttachmentPreview", () => {
  it("opens an image in an in-app preview and closes it again", async () => {
    const user = userEvent.setup();
    render(<CopilotAttachmentPreview parts={[imagePart]} />);

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview shot.png" }));
    expect(screen.getByRole("heading", { name: "shot.png" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a PDF in an in-app preview instead of linking out", async () => {
    const user = userEvent.setup();
    render(<CopilotAttachmentPreview parts={[filePart]} />);

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview notes.pdf" }));
    expect(screen.getByRole("heading", { name: "notes.pdf" })).toBeTruthy();
  });

  // A stored link expires; the tile signs a fresh one from the storage key.
  it("links other files out through a freshly signed URL", async () => {
    const zipPart = buildChatAttachmentPart({
      meta: {
        filename: "archive.zip",
        mimeType: "application/zip",
        size: 800,
        storageKey: "tenants/t1/chat/archive.zip",
      },
      url: "https://cdn.example/archive.zip",
    });
    render(<CopilotAttachmentPreview parts={[zipPart]} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("target")).toBe("_blank");
    await waitFor(() =>
      expect(link.getAttribute("href")).toBe(
        "about:blank#tenants/t1/chat/archive.zip"
      )
    );
  });
});
