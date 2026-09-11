import { describe, expect, it } from "vitest";
import { deleteStoragePrefix } from "./space-purge.js";

describe("deleteStoragePrefix", () => {
  it("walks folders then removes files", async () => {
    const listed = new Map<string, Array<{ id: string | null; name: string }>>([
      ["tenants/t/spaces/s", [{ id: null, name: "files" }]],
      ["tenants/t/spaces/s/files", [{ id: "blob-1", name: "brief.pdf" }]],
    ]);
    const removed: string[] = [];
    await deleteStoragePrefix({
      list: (prefix) => Promise.resolve(listed.get(prefix) ?? []),
      prefix: "tenants/t/spaces/s",
      remove: (paths) => {
        removed.push(...paths);
        return Promise.resolve();
      },
    });
    expect(removed).toEqual(["tenants/t/spaces/s/files/brief.pdf"]);
  });
});
