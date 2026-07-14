/** @vitest-environment happy-dom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test-utils";

const listLogFiles = vi.fn();
const listLogEntries = vi.fn();
vi.mock("@/lib/api/logs", () => ({
  listLogFiles: () => listLogFiles(),
  listLogEntries: (...args: unknown[]) => listLogEntries(...args),
}));

const { LogsPage } = await import("./LogsPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LogsPage", () => {
  it("renders entries with level, source and message for the default file", async () => {
    listLogFiles.mockResolvedValue([{ date: "2026-07-14" }]);
    listLogEntries.mockResolvedValue({
      entries: [
        {
          level: "error",
          time: "2026-07-14T10:00:00Z",
          namespace: "core",
          message: "database unreachable",
        },
      ],
      total: 1,
    });

    renderPage(<LogsPage />);

    expect(await screen.findByText("database unreachable")).toBeTruthy();
    expect(screen.getByText("error")).toBeTruthy();
    expect(screen.getByText("core")).toBeTruthy();
    // The first file is auto-selected, so entries were requested for it.
    expect(listLogEntries).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-14", offset: 0 }),
      expect.anything()
    );
  });
});
