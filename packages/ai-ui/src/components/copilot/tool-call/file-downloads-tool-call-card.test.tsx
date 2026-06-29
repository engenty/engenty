/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fileNameFromStorageKey,
  isFileDownloadsOfferOutput,
  matchesFileDownloadsToolCall,
  parseFileDownloadOfferItems,
  resolveFileDownloadOfferFiles,
} from "./file-download-offer.js";
import { FileDownloadsToolCallCard } from "./file-downloads-tool-call-card.js";

vi.mock("../../../lib/file-storage-signed-url.js", () => ({
  getFileStorageSignedUrl: vi.fn(async () => "https://signed.example/file"),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("file download offer parsing", () => {
  it("derives a filename from the storage key tail", () => {
    expect(
      fileNameFromStorageKey("tenants/t1/ai/workspace/reports/summary.csv")
    ).toBe("summary.csv");
  });

  it("parses offer output and nested invoke_frontend_tool input", () => {
    const output = {
      __type: "file_downloads",
      files: [{ key: "tenants/t1/ai/workspace/a.txt", name: "A.txt" }],
      ok: true,
    };
    expect(isFileDownloadsOfferOutput(output)).toBe(true);
    expect(parseFileDownloadOfferItems(output.files)).toHaveLength(1);
    expect(
      resolveFileDownloadOfferFiles(
        {
          input: {
            files: [{ key: "tenants/t1/ai/workspace/b.txt" }],
          },
          tool_name: "offer_file_downloads",
        },
        output
      )
    ).toEqual(output.files);
    expect(
      resolveFileDownloadOfferFiles(
        {
          input: {
            files: [{ key: "tenants/t1/ai/workspace/b.txt", name: "B.txt" }],
          },
          tool_name: "offer_file_downloads",
        },
        null
      )
    ).toEqual([{ key: "tenants/t1/ai/workspace/b.txt", name: "B.txt" }]);
  });

  it("matches resolved tool name or typed output", () => {
    expect(
      matchesFileDownloadsToolCall({ resolvedToolName: "offer_file_downloads" })
    ).toBe(true);
    expect(
      matchesFileDownloadsToolCall({
        output: {
          __type: "file_downloads",
          files: [{ key: "k", name: "k" }],
        },
      })
    ).toBe(true);
  });
});

describe("FileDownloadsToolCallCard", () => {
  it("renders download actions for offered files", async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    render(
      <FileDownloadsToolCallCard
        input={{
          files: [
            {
              key: "tenants/t1/ai/workspace/report.csv",
              mime_type: "text/csv",
              name: "report.csv",
            },
          ],
        }}
        output={{
          __type: "file_downloads",
          files: [
            {
              key: "tenants/t1/ai/workspace/report.csv",
              mime_type: "text/csv",
              name: "report.csv",
            },
          ],
          ok: true,
        }}
        resolvedToolName="offer_file_downloads"
        state="completed"
        toolName="offer_file_downloads"
      />
    );

    expect(screen.getByText("Download file")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Download report.csv" })
    );

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
