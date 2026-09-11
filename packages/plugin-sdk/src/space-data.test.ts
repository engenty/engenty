import { describe, expect, it } from "vitest";
import {
  assertSpaceDataMemberEditable,
  assertSpaceDataVersion,
  isSpaceDataRefName,
  matchSpaceDataNodeType,
  normalizeSpaceDataPath,
  parseSpaceDataRef,
  type SpaceDataNodeType,
  serializeSpaceDataRef,
  spaceDataPathSegments,
  spaceDataRefFileName,
  spaceDataRefLabel,
  spaceDataVersionsMatch,
} from "./space-data.js";
import {
  archiveDocumentEntries,
  archiveFolderEntry,
  planSpaceDataImport,
} from "./space-data-archive.js";
import {
  parseCsv,
  parseFrontmatter,
  readFolderIndex,
  serializeCsv,
  serializeFrontmatter,
  spaceDataNodeName,
  spaceDataNodeRecordId,
  spaceDataSegmentLabel,
} from "./space-data-format.js";

const bundleType: SpaceDataNodeType = {
  extension: ".offer",
  id: "offers.offer",
  kind: "bundle",
  label: "Offer",
  members: [
    { contentType: "application/json", editable: true, name: "offer.json" },
    { contentType: "application/pdf", derived: true, name: "preview.pdf" },
    { contentType: "text/plain", name: "readme.txt" },
  ],
};

describe("space data paths", () => {
  it("refuses traversal, which is not hypothetical: the same paths arrive from an agent", () => {
    expect(() => spaceDataPathSegments("Contacts/../../etc/passwd")).toThrow(
      /not allowed/
    );
    expect(() => spaceDataPathSegments("./secrets")).toThrow(/not allowed/);
  });

  it("normalises without inventing segments", () => {
    expect(normalizeSpaceDataPath("/Contacts//People/")).toBe(
      "Contacts/People"
    );
    expect(normalizeSpaceDataPath("")).toBe("");
  });

  it("matches the LONGEST extension so .contact.md never files as .md", () => {
    const types: SpaceDataNodeType[] = [
      { extension: ".md", id: "notes.note", kind: "record", label: "Note" },
      {
        extension: ".contact.md",
        id: "contacts.contact",
        kind: "record",
        label: "Contact",
      },
    ];
    expect(matchSpaceDataNodeType(types, "anna.contact.md")?.id).toBe(
      "contacts.contact"
    );
    expect(matchSpaceDataNodeType(types, "anna.md")?.id).toBe("notes.note");
  });
});

describe("node names carry identity", () => {
  it("round-trips the record id through the filename", () => {
    const name = spaceDataNodeName({
      extension: ".contact.md",
      recordId: "0f4c9e1a-2b3d-4c5e-8f90-1a2b3c4d5e6f",
      title: "Acme GmbH & Co. KG",
    });
    expect(name).toBe(
      "acme-gmbh-co-kg__0f4c9e1a-2b3d-4c5e-8f90-1a2b3c4d5e6f.contact.md"
    );
    expect(spaceDataNodeRecordId(name, ".contact.md")).toBe(
      "0f4c9e1a-2b3d-4c5e-8f90-1a2b3c4d5e6f"
    );
  });

  it("answers null rather than guessing for a name that carries no id", () => {
    expect(spaceDataNodeRecordId("anna.contact.md", ".contact.md")).toBeNull();
    expect(spaceDataNodeRecordId("anna__x.md", ".contact.md")).toBeNull();
  });

  it("reads the id off a name with NO extension — a folder that carries one", () => {
    // `slice(0, -0)` is the empty string, so this used to answer null for
    // every extension-less segment: a well-formed path read as a 404.
    const name = spaceDataNodeName({
      extension: "",
      recordId: "kb-1",
      title: "Handbook",
    });
    expect(name).toBe("handbook__kb-1");
    expect(spaceDataNodeRecordId(name, "")).toBe("kb-1");
    expect(spaceDataNodeRecordId("handbook", "")).toBeNull();
  });
});

describe("write-back is schema-mapped or it does not exist", () => {
  it("refuses a derived member by name, before any read", () => {
    expect(() =>
      assertSpaceDataMemberEditable(bundleType, "preview.pdf")
    ).toThrow(/derived render/);
  });

  it("refuses a member the node type does not declare", () => {
    expect(() =>
      assertSpaceDataMemberEditable(bundleType, "anything.txt")
    ).toThrow(/not a member/);
  });

  it("refuses a declared member that is not marked editable", () => {
    expect(() =>
      assertSpaceDataMemberEditable(bundleType, "readme.txt")
    ).toThrow(/read-only/);
  });

  it("allows a declared, editable member", () => {
    expect(assertSpaceDataMemberEditable(bundleType, "offer.json").name).toBe(
      "offer.json"
    );
  });
});

describe("optimistic concurrency", () => {
  it("refuses a stale write with 409 rather than overwriting", () => {
    try {
      assertSpaceDataVersion("2026-08-14T10:00:00Z", "2026-08-14T09:00:00Z");
      throw new Error("expected a conflict");
    } catch (error) {
      expect((error as { code: string; status: number }).code).toBe(
        "data_conflict"
      );
      expect((error as { status: number }).status).toBe(409);
    }
  });

  it("refuses a write that carries no base version at all", () => {
    // "I did not read it first" is exactly the case last-write-wins hides.
    expect(() => assertSpaceDataVersion("2026-08-14T10:00:00Z", "")).toThrow(
      /no base version/
    );
  });

  it("allows the write whose base version is current", () => {
    expect(() =>
      assertSpaceDataVersion("2026-08-14T10:00:00Z", "2026-08-14T10:00:00Z")
    ).not.toThrow();
  });

  it("treats the SAME INSTANT in two serialisations as the same version", () => {
    // The update path round-trips a Date (`…439Z`); the read path comes
    // straight out of PostgREST (`…439+00:00`). Comparing raw strings makes a
    // client that reuses the version its own write returned collide with
    // itself — and a spurious 409 teaches callers that conflicts are noise,
    // which is exactly the habit this mechanism exists to prevent.
    expect(
      spaceDataVersionsMatch(
        "2026-08-14T15:57:52.439Z",
        "2026-08-14T15:57:52.439+00:00"
      )
    ).toBe(true);
    expect(() =>
      assertSpaceDataVersion(
        "2026-08-14T15:57:52.439+00:00",
        "2026-08-14T15:57:52.439Z"
      )
    ).not.toThrow();
  });

  it("still refuses a genuinely different instant", () => {
    expect(
      spaceDataVersionsMatch(
        "2026-08-14T15:57:52.439Z",
        "2026-08-14T15:57:52.440Z"
      )
    ).toBe(false);
  });

  it("compares non-timestamp tokens exactly", () => {
    // An adapter versioning on an integer or an etag must not get date parsing.
    expect(spaceDataVersionsMatch("7", "07")).toBe(false);
    expect(spaceDataVersionsMatch("etag-a", "etag-a")).toBe(true);
  });
});

describe("frontmatter", () => {
  it("round-trips fields and body", () => {
    const text = serializeFrontmatter(
      { email: "a@b.c", id: "x1", roles: ["client", "partner"] },
      "Notes about them.\n"
    );
    const parsed = parseFrontmatter(text);
    expect(parsed.frontmatter).toEqual({
      email: "a@b.c",
      id: "x1",
      roles: ["client", "partner"],
    });
    expect(parsed.body).toBe("Notes about them.");
  });

  it("drops nulls so a round trip does not grow the file", () => {
    expect(serializeFrontmatter({ a: 1, b: null }, "")).not.toContain("b:");
  });

  it("THROWS on a malformed block instead of blanking every field", () => {
    expect(() => parseFrontmatter("---\n: : :\n---\nbody")).toThrow(
      /not valid YAML/
    );
  });

  it("treats a document with no frontmatter as all body", () => {
    expect(parseFrontmatter("just text").frontmatter).toEqual({});
  });
});

describe("folder index", () => {
  it("lets index.json win the fields and index.md supply the description", () => {
    const index = readFolderIndex({
      json: JSON.stringify({ title: "Customers", owner: "sales" }),
      markdown: serializeFrontmatter(
        { owner: "marketing", title: "Old" },
        "Everyone we invoice."
      ),
    });
    expect(index.title).toBe("Customers");
    expect(index.fields.owner).toBe("sales");
    expect(index.description).toBe("Everyone we invoice.");
  });

  it("survives a corrupt index.json — the tree is the point, metadata is decoration", () => {
    expect(readFolderIndex({ json: "{not json" }).fields).toEqual({});
  });
});

describe("csv", () => {
  it("round-trips quoting, commas, newlines and embedded quotes", () => {
    const csv = serializeCsv(
      ["name", "note"],
      [{ name: 'A "quoted", name', note: "line1\nline2" }]
    );
    const rows = parseCsv(csv);
    expect(rows).toEqual([{ name: 'A "quoted", name', note: "line1\nline2" }]);
  });

  it("renders arrays as a readable joined cell", () => {
    expect(serializeCsv(["roles"], [{ roles: ["a", "b"] }])).toContain("a; b");
  });
});

describe("reference files (D5)", () => {
  it("round-trips a shortcut to a record", () => {
    const ref = {
      dataPath: "Offers/draft/relaunch__7.offer",
      moduleId: "offers",
      nodeType: "offers.offer",
      recordId: "7",
      title: "Relaunch offer",
    };
    expect(parseSpaceDataRef(serializeSpaceDataRef(ref))).toEqual(ref);
  });

  it("answers null for anything that is not a ref, rather than throwing", () => {
    // A hand-broken shortcut should look odd in the tree, not break the folder
    // it sits in.
    expect(parseSpaceDataRef("{")).toBeNull();
    expect(parseSpaceDataRef("[]")).toBeNull();
    expect(
      parseSpaceDataRef(JSON.stringify({ moduleId: "offers" }))
    ).toBeNull();
  });

  it("names and labels a shortcut file", () => {
    expect(spaceDataRefFileName("Relaunch offer")).toBe(
      "Relaunch offer.ref.json"
    );
    expect(spaceDataRefLabel("Relaunch offer.ref.json")).toBe("Relaunch offer");
    expect(isSpaceDataRefName("notes.md")).toBe(false);
  });
});

describe("export is the tree, written down (D5)", () => {
  const contactDoc = {
    kind: "record" as const,
    members: [
      {
        content: "---\nid: 1\n---\n\nNotes.\n",
        contentType: "text/markdown",
        derived: false,
        editable: true,
        encoding: "utf8" as const,
        name: "anna__1.contact.md",
      },
    ],
    name: "anna__1.contact.md",
    nodeType: "contacts.contact",
    path: "People/anna__1.contact.md",
    recordId: "1",
    version: "v1",
  };

  const offerDoc = {
    kind: "bundle" as const,
    members: [
      {
        content: '{"title":"Relaunch"}',
        contentType: "application/json",
        derived: false,
        editable: true,
        encoding: "utf8" as const,
        name: "offer.json",
      },
      {
        content: "Dear…",
        contentType: "text/markdown",
        derived: false,
        editable: true,
        encoding: "utf8" as const,
        name: "letter.md",
      },
      {
        content: "# Rendered",
        contentType: "text/markdown",
        derived: true,
        editable: false,
        encoding: "utf8" as const,
        name: "summary.md",
      },
    ],
    name: "relaunch__7.offer",
    nodeType: "offers.offer",
    path: "draft/relaunch__7.offer",
    recordId: "7",
    version: "v2",
  };

  it("writes a record as one file and a bundle as its directory", () => {
    expect(
      archiveDocumentEntries({
        document: contactDoc,
        path: "Contacts/People/anna__1.contact.md",
      }).map((entry) => entry.path)
    ).toEqual(["Contacts/People/anna__1.contact.md"]);
    expect(
      archiveDocumentEntries({
        document: offerDoc,
        path: "Offers/draft/relaunch__7.offer",
      }).map((entry) => entry.path)
    ).toEqual([
      "Offers/draft/relaunch__7.offer/offer.json",
      "Offers/draft/relaunch__7.offer/letter.md",
    ]);
  });

  it("SKIPS derived members — what comes back in is what could go out", () => {
    // Exporting a render would put a stale copy in the archive, and importing
    // it would try to write a member that refuses writes.
    const names = archiveDocumentEntries({
      document: offerDoc,
      path: "Offers/draft/relaunch__7.offer",
    }).map((entry) => entry.path);
    expect(names.some((path) => path.endsWith("summary.md"))).toBe(false);
  });

  it("gives a folder an index.md carrying its name and description", () => {
    const entry = archiveFolderEntry({
      folder: {
        description: "Everyone we invoice.",
        name: "Customers",
        path: "Customers",
      },
      path: "Contacts/Customers",
    });
    expect(entry.path).toBe("Contacts/Customers/index.md");
    expect(entry.content).toContain("title: Customers");
    expect(entry.content).toContain("Everyone we invoice.");
  });

  it("round-trips: an exported tree groups back into the same folders and nodes", () => {
    const archive = {
      entries: [
        archiveFolderEntry({
          folder: { name: "draft", path: "draft" },
          path: "Offers/draft",
        }),
        ...archiveDocumentEntries({
          document: offerDoc,
          path: "Offers/draft/relaunch__7.offer",
        }),
        ...archiveDocumentEntries({
          document: contactDoc,
          path: "Contacts/People/anna__1.contact.md",
        }),
      ],
      exportedAt: "2026-08-14T10:00:00Z",
      spaceId: "space-1",
    };
    const plan = planSpaceDataImport({
      archive,
      bundleExtensions: [".offer"],
    });
    expect(plan.folders.map((folder) => folder.path)).toEqual(["Offers/draft"]);
    expect(plan.nodes.map((node) => node.path)).toEqual([
      "Contacts/People/anna__1.contact.md",
      "Offers/draft/relaunch__7.offer",
    ]);
    // The bundle arrives as ONE node with its members, which is the shape the
    // write path takes — not four unrelated files.
    const bundle = plan.nodes.find((node) => node.path.endsWith(".offer"));
    expect(bundle?.members.map((member) => member.name)).toEqual([
      "offer.json",
      "letter.md",
    ]);
  });
});

describe("a path segment, as a person reads it", () => {
  it("drops the id and keeps the readable half", () => {
    expect(
      spaceDataSegmentLabel("kuesten-wissen-2__019fea6b-141a-756b-847d-93c3")
    ).toBe("kuesten-wissen-2");
    expect(
      spaceDataSegmentLabel("sicherheit-an-bord__019fea70-0001.article.md")
    ).toBe("sicherheit-an-bord");
  });

  it("leaves a segment that carries no id alone", () => {
    expect(spaceDataSegmentLabel("People")).toBe("People");
    expect(spaceDataSegmentLabel("contacts.csv")).toBe("contacts.csv");
  });
});
