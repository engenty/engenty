/** @vitest-environment happy-dom */
// Chat image and PDF attachments must open an in-app preview (close + download),
// not navigate the browser to the signed URL. Other file tiles still link out.
import { cleanup, render, screen } from "@testing-library/react";
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

vi.mock("../../../lib/file-storage-signed-url.js", () => ({
  getFileStorageSignedUrl: vi.fn(
    async (key: string) => `https://signed.test/${key}`
  ),
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
  it("opens a preview dialog for an image instead of linking out", async () => {
    const user = userEvent.setup();
    render(<CopilotAttachmentPreview parts={[imagePart]} />);

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview shot.png" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "shot.png" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("closes the preview from the dialog close control", async () => {
    const user = userEvent.setup();
    render(<CopilotAttachmentPreview parts={[imagePart]} />);

    await user.click(screen.getByRole("button", { name: "Preview shot.png" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a preview dialog for a PDF instead of linking out", async () => {
    const user = userEvent.setup();
    render(<CopilotAttachmentPreview parts={[filePart]} />);

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview notes.pdf" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "notes.pdf" })).toBeTruthy();
    expect(
      screen.getByRole("dialog").querySelector("iframe")?.getAttribute("src")
    ).toContain("notes.pdf");
    expect(screen.getByRole("button", { name: /Download/ })).toBeTruthy();
  });

  it("keeps non-previewable files as download links", () => {
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
    expect(link.getAttribute("href")).toBe("https://cdn.example/archive.zip");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders stream images at natural aspect ratio, not as square thumbs", () => {
    render(<CopilotAttachmentPreview parts={[imagePart]} />);
    const img = screen.getByRole("img", { name: "shot.png" });
    expect(img.className).toContain("object-contain");
    expect(img.className).toContain("max-h-80");
    expect(img.getAttribute("width")).toBeNull();
    expect(img.getAttribute("height")).toBeNull();
  });

  it("keeps images and files in separate groups", () => {
    render(<CopilotAttachmentPreview parts={[imagePart, filePart]} />);
    const images = screen.getByTestId("copilot-attachment-images");
    const files = screen.getByTestId("copilot-attachment-files");
    expect(images.querySelector("img")).toBeTruthy();
    expect(files.querySelector("img")).toBeNull();
    expect(files.querySelector("button")).toBeTruthy();
  });

  it("stacks multiple images in a two-column grid", () => {
    const second = buildChatAttachmentPart({
      meta: {
        filename: "other.png",
        mimeType: "image/png",
        size: 800,
        storageKey: "tenants/t1/chat/other.png",
      },
      url: "https://cdn.example/other.png",
    });
    render(<CopilotAttachmentPreview parts={[imagePart, second]} />);
    const grid = screen.getByTestId("copilot-attachment-images");
    expect(grid.className).toContain("grid-cols-2");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});
