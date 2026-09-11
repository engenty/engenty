import { describe, expect, it } from "vitest";
import { isFileSpaceProxyUrl, readSpaceDriveRows } from "./space-drive-client";

/**
 * The shape assumption that has now cost this plan twice.
 *
 * Phase 1's container walk read only `{data:[…]}` while the shipping endpoint
 * returned a bare array, so every goal/routine/project resolved to empty with
 * green tests. The Drive hit the same wall from the other side: `/api/projects`
 * is a bare array, `/api/kb/articles` is `{data,total,page,page_size}`. Pinned
 * here so the next reader does not have to rediscover it.
 */
describe("readSpaceDriveRows", () => {
  it("reads a bare array — the /api/projects shape", () => {
    expect(readSpaceDriveRows([{ id: "a" }, { id: "b" }])).toHaveLength(2);
  });

  it("reads a paginated envelope — the /api/kb/articles shape", () => {
    expect(
      readSpaceDriveRows({
        data: [{ id: "a" }],
        page: 1,
        page_size: 100,
        total: 1,
      })
    ).toEqual([{ id: "a" }]);
  });

  it("returns nothing for a shape it does not know", () => {
    // Empty, not a throw: one unrecognised source must not blank a tree that
    // renders three other stores correctly.
    expect(readSpaceDriveRows({ folders: [], files: [] })).toEqual([]);
    expect(readSpaceDriveRows(null)).toEqual([]);
    expect(readSpaceDriveRows(undefined)).toEqual([]);
    expect(readSpaceDriveRows("nope")).toEqual([]);
  });
});

describe("isFileSpaceProxyUrl", () => {
  it("treats relative /api download paths as authenticated proxies", () => {
    expect(
      isFileSpaceProxyUrl("/api/files/spaces/space/abc/files/cnx:x/download")
    ).toBe(true);
  });

  it("treats same-origin /api URLs as proxies", () => {
    expect(
      isFileSpaceProxyUrl(
        "https://spaces.engenty.localhost/api/files/spaces/space/abc/files/1/download"
      )
    ).toBe(true);
  });

  it("leaves signed storage URLs alone", () => {
    expect(
      isFileSpaceProxyUrl(
        "https://project.supabase.co/storage/v1/object/sign/files/a.pdf?token=x"
      )
    ).toBe(false);
  });
});
