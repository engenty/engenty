/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";
import { matchesFileDownloadsToolCall } from "./file-download-offer.js";
import { FileDownloadsToolCallCard } from "./file-downloads-tool-call-card.js";

vi.mock("../../../lib/file-storage-signed-url.js", () => ({
  getFileStorageSignedUrl: vi.fn(async () => "https://signed.example/file"),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Legacy transcripts still hold `offer_file_downloads` calls; they must keep
// their download buttons.
describe("legacy file download offers", () => {
  it("routes by resolved tool name or by the typed output", () => {
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

  it("downloads the offered file through a signed URL", async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const key = "tenants/t1/ai/workspace/report.csv";

    render(
      <FileDownloadsToolCallCard
        output={{
          __type: "file_downloads",
          files: [{ key, mime_type: "text/csv", name: "report.csv" }],
          ok: true,
        }}
        resolvedToolName="offer_file_downloads"
        state="completed"
        toolName="offer_file_downloads"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Download report.csv" })
    );

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
    expect(getFileStorageSignedUrl).toHaveBeenCalledWith(key);
  });
});
