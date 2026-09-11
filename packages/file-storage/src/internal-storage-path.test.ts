import { describe, expect, it } from "vitest";
import {
  fileStorageSpaceObjectKey,
  fileStorageSpacePrefix,
  fileStorageTenantObjectKey,
  inboxMessageIdFromFileStorageKey,
  knowledgeBaseSlugFromFileStorageKey,
  knowledgePathLabelFromFileStorageKey,
  moduleFolderFromFileStorageKey,
  parseFileStorageSpaceObjectKey,
  pathSegmentsAfterFileStorageContainerRoot,
  pathSegmentsAfterFileStorageTenantRoot,
} from "./internal-storage-path.js";

const TID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MID = "11111111-2222-3333-4444-555555555555";
const SID = "99999999-8888-7777-6666-555555555555";
const OTHER_SID = "12121212-3434-5656-7878-909090909090";

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

describe("fileStorageSpacePrefix", () => {
  it("is the space root a delete removes in one sweep", () => {
    expect(fileStorageSpacePrefix(TID, SID)).toBe(
      `tenants/${TID}/spaces/${SID}`
    );
  });
});

describe("fileStorageSpaceObjectKey", () => {
  it("nests the space between the tenant and the module folder", () => {
    expect(fileStorageSpaceObjectKey(TID, SID, "files", "brief.pdf")).toBe(
      `tenants/${TID}/spaces/${SID}/files/brief.pdf`
    );
    expect(
      fileStorageSpaceObjectKey(TID, SID, "ai", "workspace", "commons")
    ).toBe(`tenants/${TID}/spaces/${SID}/ai/workspace/commons`);
  });

  it("rejects segments that could escape the boundary", () => {
    expect(() => fileStorageSpaceObjectKey(TID, "", "files")).toThrow(
      "space_id_required"
    );
    expect(() => fileStorageSpaceObjectKey(TID, "../x", "files")).toThrow(
      "space_id_invalid"
    );
    expect(() => fileStorageSpaceObjectKey(TID, "a/b", "files")).toThrow(
      "space_id_invalid"
    );
    expect(() => fileStorageSpaceObjectKey("", SID, "files")).toThrow(
      "tenant_id_required"
    );
  });

  it("gives two spaces disjoint prefixes", () => {
    const a = fileStorageSpaceObjectKey(TID, SID, "files");
    const b = fileStorageSpaceObjectKey(TID, OTHER_SID, "files");
    expect(a.startsWith(`tenants/${TID}/spaces/${OTHER_SID}/`)).toBe(false);
    expect(b.startsWith(`tenants/${TID}/spaces/${SID}/`)).toBe(false);
  });
});

describe("parseFileStorageSpaceObjectKey", () => {
  it("round-trips a space key", () => {
    expect(
      parseFileStorageSpaceObjectKey(
        fileStorageSpaceObjectKey(TID, SID, "files", "sub", "brief.pdf")
      )
    ).toEqual({
      moduleFolder: "files",
      pathSegments: ["sub", "brief.pdf"],
      spaceId: SID,
      tenantId: TID,
    });
  });

  it("discriminates tenant-level keys from space-level ones", () => {
    expect(
      parseFileStorageSpaceObjectKey(
        fileStorageTenantObjectKey(TID, "inbox", MID, "a.pdf")
      )
    ).toBeNull();
    expect(parseFileStorageSpaceObjectKey(`tenants/${TID}/spaces`)).toBeNull();
    expect(
      parseFileStorageSpaceObjectKey(`tenants/${TID}/spaces/${SID}`)
    ).toBeNull();
    expect(parseFileStorageSpaceObjectKey(`other/${TID}/spaces/${SID}/x`)).toBe(
      null
    );
  });
});

describe("moduleFolderFromFileStorageKey", () => {
  it("reads module segment under tenants/", () => {
    expect(
      moduleFolderFromFileStorageKey(`tenants/${TID}/expenses/a.pdf`)
    ).toBe("expenses");
    expect(moduleFolderFromFileStorageKey(`other/${TID}/x`)).toBeUndefined();
  });

  it("skips the space boundary rather than reporting it as the module", () => {
    expect(
      moduleFolderFromFileStorageKey(
        fileStorageSpaceObjectKey(TID, SID, "expenses", "a.pdf")
      )
    ).toBe("expenses");
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

  it("keeps the space segments — it strips the TENANT root, literally", () => {
    expect(
      pathSegmentsAfterFileStorageTenantRoot(
        fileStorageSpaceObjectKey(TID, SID, "expenses", "a")
      )
    ).toEqual(["spaces", SID, "expenses", "a"]);
  });
});

describe("pathSegmentsAfterFileStorageContainerRoot", () => {
  it("hides the space boundary from human-facing paths", () => {
    expect(
      pathSegmentsAfterFileStorageContainerRoot(
        fileStorageSpaceObjectKey(TID, SID, "expenses", "a")
      )
    ).toEqual(["expenses", "a"]);
  });

  it("falls back to the tenant root for tenant-level keys", () => {
    expect(
      pathSegmentsAfterFileStorageContainerRoot(`tenants/${TID}/expenses/a`)
    ).toEqual(["expenses", "a"]);
  });
});
