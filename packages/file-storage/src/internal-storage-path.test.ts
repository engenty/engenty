import { describe, expect, it } from "vitest";
import {
  fileStorageTenantObjectKey,
  inboxMessageIdFromFileStorageKey,
  knowledgeBaseSlugFromFileStorageKey,
  knowledgePathLabelFromFileStorageKey,
  moduleFolderFromFileStorageKey,
  pathSegmentsAfterFileStorageTenantRoot,
} from "./internal-storage-path.js";

const TID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MID = "11111111-2222-3333-4444-555555555555";

describe("fileStorageTenantObjectKey", () => {
  it("builds tenant-scoped paths", () => {
    expect(fileStorageTenantObjectKey(TID, "inbox", MID, "file.pdf")).toBe(
      `tenants/${TID}/inbox/${MID}/file.pdf`
    );
    expect(
      fileStorageTenantObjectKey(TID, "knowledge-base", "my-kb", "x.docx")
    ).toBe(`tenants/${TID}/knowledge-base/my-kb/x.docx`);
  });
});

describe("moduleFolderFromFileStorageKey", () => {
  it("reads module segment under tenants/", () => {
    expect(
      moduleFolderFromFileStorageKey(`tenants/${TID}/expenses/a.pdf`)
    ).toBe("expenses");
    expect(moduleFolderFromFileStorageKey(`other/${TID}/x`)).toBeUndefined();
  });
});

describe("inboxMessageIdFromFileStorageKey", () => {
  it("extracts message id from tenants/.../inbox/...", () => {
    expect(
      inboxMessageIdFromFileStorageKey(`tenants/${TID}/inbox/${MID}/a.pdf`)
    ).toBe(MID);
  });
});

describe("knowledgeBaseSlugFromFileStorageKey", () => {
  it("matches tenants/.../knowledge-base/<slug>/...", () => {
    expect(
      knowledgeBaseSlugFromFileStorageKey(
        `tenants/${TID}/knowledge-base/my-slug/doc.pdf`
      )
    ).toBe("my-slug");
  });
});

describe("knowledgePathLabelFromFileStorageKey", () => {
  it("returns a display label when a KB slug is present", () => {
    expect(
      knowledgePathLabelFromFileStorageKey(
        `tenants/${TID}/knowledge-base/foo/bar.pdf`
      )
    ).toBe("knowledge-base › foo");
  });
});

describe("pathSegmentsAfterFileStorageTenantRoot", () => {
  it("strips tenants/<id>/ prefix", () => {
    expect(
      pathSegmentsAfterFileStorageTenantRoot(`tenants/${TID}/inbox/${MID}/x`)
    ).toEqual(["inbox", MID, "x"]);
    expect(
      pathSegmentsAfterFileStorageTenantRoot(`tenants/${TID}/expenses/a`)
    ).toEqual(["expenses", "a"]);
  });
});
