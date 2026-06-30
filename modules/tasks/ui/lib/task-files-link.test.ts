import { describe, expect, it } from "vitest";
import { buildTaskWorkspaceFilesHref } from "./task-files-link.js";

describe("buildTaskWorkspaceFilesHref", () => {
  it("links to admin files list with tenant task workspace prefix", () => {
    const href = buildTaskWorkspaceFilesHref(
      "019e5460-0d29-7e84-978f-451b21453655",
      "ENG-1"
    );

    expect(href).toBe(
      "/admin/files?prefix=tenants%2F019e5460-0d29-7e84-978f-451b21453655%2Fai%2Fworkspace%2Ftasks%2FENG-1%2F"
    );
  });
});
