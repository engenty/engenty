import { describe, expect, it } from "vitest";
import { applyExplorerFileOverlay } from "./file-storage-explorer-labels.js";

const SID = "019fe917-2c4d-75e0-a3b5-f25c46b2c706";
const KEY = `tenants/t/spaces/${SID}/files/0ce2b852-4040-41a0-89f7-01ca644b87f4`;

describe("applyExplorerFileOverlay", () => {
  it("replaces uuid filename and mime from file_entries", () => {
    const file = {
      filename: "0ce2b852-4040-41a0-89f7-01ca644b87f4",
      key: KEY,
      mime_type: "application/octet-stream",
    };
    applyExplorerFileOverlay(file, {
      files: {
        [KEY]: { filename: "mietvertrag.pdf", mimeType: "application/pdf" },
      },
      segments: { [SID]: "Haushalt" },
      titles: {},
    });
    expect(file.filename).toBe("mietvertrag.pdf");
    expect(file.mime_type).toBe("application/pdf");
    expect((file as typeof file & { path_label?: string }).path_label).toBe(
      "spaces › Haushalt › files"
    );
  });

  it("leaves unknown keys as the uuid leaf", () => {
    const file = {
      filename: "task-id",
      key: `tenants/t/spaces/${SID}/ai/workspace/tasks/task-id`,
      mime_type: "text/plain",
    };
    applyExplorerFileOverlay(file, {
      files: {},
      segments: { [SID]: "Haushalt" },
      titles: {},
    });
    expect(file.filename).toBe("task-id");
    expect((file as typeof file & { path_label?: string }).path_label).toBe(
      "spaces › Haushalt › ai › workspace › tasks"
    );
  });
});
