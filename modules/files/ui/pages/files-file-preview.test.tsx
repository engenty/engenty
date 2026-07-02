/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFilesPreviewPdfUrl } from "../api.js";
import { FilePreviewBlock, parseDelimitedText } from "./files-file-preview.js";

// Stub the animated icon: its framer-motion internals pull a second React copy
// in the workspace and are irrelevant to preview behavior under test.
vi.mock("@engenty/ui-icons", () => ({
  AnimatedLoaderIcon: () => null,
}));

vi.mock("../api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.js")>();
  return {
    ...actual,
    getFilesPreviewPdfUrl: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderPreview(
  props: Partial<Parameters<typeof FilePreviewBlock>[0]> & {
    fileKey: string;
    filename: string;
    mimeType: string;
    url: string;
  }
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FilePreviewBlock
        generatingLabel="Generating…"
        loadingLabel="Loading…"
        noPreviewLabel="No preview"
        truncatedLabel="Truncated"
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("FilePreviewBlock office preview", () => {
  it("renders iframe with signed PDF URL when Gotenberg preview API succeeds", async () => {
    const mockPreview = vi.mocked(getFilesPreviewPdfUrl);
    mockPreview.mockResolvedValue({
      bucket: "files",
      cached: false,
      key: "tenants/t1/knowledge-base/default/x.docx",
      sidecar_key: "tenants/t1/knowledge-base/default/x.docx.preview.pdf",
      url: "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK",
    });

    renderPreview({
      fileKey: "tenants/t1/knowledge-base/default/x.docx",
      filename: "x.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      url: "https://signed.example/original.docx",
    });

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe?.getAttribute("src")).toBe(
        "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK"
      );
    });
  });
});

describe("FilePreviewBlock text preview", () => {
  it("renders a CSV file as a table (agent-written workspace file case)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "name,role\nAlice,Lead\nBob,Eng",
      })
    );

    renderPreview({
      fileKey:
        "tenants/t1/ai/workspace/users/u1/team_pesendorfer_reports_to_updates.csv",
      filename: "team_pesendorfer_reports_to_updates.csv",
      mimeType: "text/csv",
      url: "https://signed.example/report.csv",
    });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeTruthy();
    });
    expect(screen.getByText("role")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(document.querySelector("table")).toBeTruthy();
  });

  it("renders a plain text file as preformatted text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "hello world\nline two",
      })
    );

    renderPreview({
      fileKey: "tenants/t1/files/notes.txt",
      filename: "notes.txt",
      mimeType: "text/plain",
      url: "https://signed.example/notes.txt",
    });

    await waitFor(() => {
      expect(screen.getByText(/hello world/)).toBeTruthy();
    });
    expect(document.querySelector("pre")).toBeTruthy();
  });

  it("falls back to no-preview for unsupported binary types", () => {
    renderPreview({
      fileKey: "tenants/t1/files/archive.zip",
      filename: "archive.zip",
      mimeType: "application/zip",
      url: "https://signed.example/archive.zip",
    });
    expect(screen.getByText("No preview")).toBeTruthy();
  });
});

describe("parseDelimitedText", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    const rows = parseDelimitedText('a,"b,c","d""e"\r\n1,2,3', ",");
    expect(rows).toEqual([
      ["a", "b,c", 'd"e'],
      ["1", "2", "3"],
    ]);
  });

  it("parses tab-separated values", () => {
    expect(parseDelimitedText("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
