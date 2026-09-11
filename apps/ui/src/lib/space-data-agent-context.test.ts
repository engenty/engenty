import type { SpaceDataDocument } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  buildSpaceDataArtifactSlice,
  buildSpaceDataFileSlice,
  buildSpaceDataFileTextSlice,
  buildSpaceDataNodeSlice,
  SPACE_DATA_CSV_PREVIEW_ROWS,
  SPACE_DATA_EXCERPT_MAX_CHARS,
  spaceDataAgentExcerpt,
  spaceDataModuleIdOfNodeType,
} from "./space-data-agent-context";

function csv(rows: number): string {
  const body = Array.from(
    { length: rows },
    (_, index) => `Person ${index},p${index}@example.test`
  ).join("\n");
  return `name,email\n${body}\n`;
}

function document(
  overrides: Partial<SpaceDataDocument> = {}
): SpaceDataDocument {
  return {
    kind: "record",
    members: [
      {
        content: "name,email\nAda,ada@example.test\n",
        contentType: "text/csv",
        derived: true,
        editable: false,
        encoding: "utf8",
        name: "contacts.csv",
      },
    ],
    name: "contacts.csv",
    nodeType: "contacts.collection",
    path: "Contacts/contacts.csv",
    recordId: "collection",
    version: "v1",
    ...overrides,
  };
}

describe("spaceDataAgentExcerpt", () => {
  it("keeps the header and cuts a CSV by ROWS, not by characters", () => {
    const excerpt = spaceDataAgentExcerpt(csv(50), "text/csv");
    expect(excerpt.startsWith("name,email")).toBe(true);
    // A byte cut would have ended mid-record; every line here is a whole row.
    const rows = excerpt
      .split("\n")
      .filter((line) => line.startsWith("Person "));
    expect(rows).toHaveLength(SPACE_DATA_CSV_PREVIEW_ROWS);
    expect(rows.every((line) => line.includes("@example.test"))).toBe(true);
  });

  it("says how many rows it dropped, so nobody reports the preview as the total", () => {
    expect(spaceDataAgentExcerpt(csv(50), "text/csv")).toContain(
      "(30 more rows)"
    );
  });

  it("leaves a short CSV whole and unannotated", () => {
    const excerpt = spaceDataAgentExcerpt(csv(3), "text/csv");
    expect(excerpt).not.toContain("more rows");
    expect(excerpt).toContain("Person 2");
  });

  it("caps non-CSV text and marks the cut", () => {
    const excerpt = spaceDataAgentExcerpt("x".repeat(9000), "text/markdown");
    expect(excerpt).toContain("… (truncated)");
    expect(excerpt.length).toBeLessThan(SPACE_DATA_EXCERPT_MAX_CHARS + 40);
  });

  it("falls back to plain truncation when a CSV has no parseable header", () => {
    expect(spaceDataAgentExcerpt("", "text/csv")).toBe("");
  });
});

describe("spaceDataModuleIdOfNodeType", () => {
  it("answers the MODULE id, which is what page_module is keyed by", () => {
    expect(spaceDataModuleIdOfNodeType("contacts.contact")).toBe("contacts");
    expect(spaceDataModuleIdOfNodeType("offers.offer")).toBe("offers");
  });

  it("answers undefined rather than an empty string", () => {
    expect(spaceDataModuleIdOfNodeType("")).toBeUndefined();
  });
});

describe("buildSpaceDataNodeSlice", () => {
  it("gives the agent the /data path it can actually read", () => {
    const slice = buildSpaceDataNodeSlice(document());
    expect(slice.page?.data_agent_path).toBe("/data/Contacts/contacts.csv");
    expect(slice.app_context?.[0]?.description).toContain(
      "/data/Contacts/contacts.csv"
    );
  });

  it("carries identity, node type and the version the pane read", () => {
    const slice = buildSpaceDataNodeSlice(document());
    expect(slice.page?.data_node_type).toBe("contacts.collection");
    expect(slice.page?.data_path).toBe("Contacts/contacts.csv");
    expect(slice.page?.data_version).toBe("v1");
    expect(slice.page?.page_title).toBe("contacts.csv");
  });

  it("omits the version a collection view does not have", () => {
    // A collection has no single `updated_at` — which is exactly why its write
    // is the bulk import. An empty string here would read as a version.
    const slice = buildSpaceDataNodeSlice(document({ version: "" }));
    expect(slice.page && "data_version" in slice.page).toBe(false);
  });

  it("sets selection.entity_type to the module id, not the node type", () => {
    // `resolveCurrentPageModule` reads entity_type FIRST and reports it as
    // page_module — "contacts.contact" there would break skill lookups.
    const slice = buildSpaceDataNodeSlice(
      document({ nodeType: "contacts.contact", recordId: "abc" })
    );
    expect(slice.selection).toEqual({
      entity_id: "abc",
      entity_type: "contacts",
    });
  });

  it("excerpts every member of a bundle, each labelled", () => {
    const slice = buildSpaceDataNodeSlice(
      document({
        kind: "bundle",
        members: [
          {
            content: "# Letter",
            contentType: "text/html",
            derived: false,
            editable: true,
            encoding: "utf8",
            name: "letter.html",
          },
          {
            content: '{"total":42}',
            contentType: "application/json",
            derived: false,
            editable: true,
            encoding: "utf8",
            name: "positions.json",
          },
        ],
        name: "RE-2026-0001",
        nodeType: "invoices.invoice",
      })
    );
    const value = String(slice.app_context?.[0]?.value);
    expect(value).toContain("--- letter.html (text/html)");
    expect(value).toContain("--- positions.json (application/json)");
    expect(value).toContain('{"total":42}');
    expect(slice.page?.data_members).toHaveLength(2);
  });

  it("stays far under the 32 KB snapshot ceiling for a huge document", () => {
    const slice = buildSpaceDataNodeSlice(
      document({
        members: [
          {
            content: csv(20_000),
            contentType: "text/csv",
            derived: true,
            editable: false,
            encoding: "utf8",
            name: "contacts.csv",
          },
        ],
      })
    );
    expect(JSON.stringify(slice).length).toBeLessThan(8 * 1024);
  });
});

describe("buildSpaceDataFileSlice", () => {
  it("names the file and selects it, and claims no agent path", () => {
    const slice = buildSpaceDataFileSlice({
      fileId: "file-1",
      mimeType: "text/csv",
      name: "clients.csv",
      sizeBytes: 85,
    });
    expect(slice.page?.file_name).toBe("clients.csv");
    expect(slice.page?.file_size_bytes).toBe(85);
    expect(slice.selection).toEqual({ entity_id: "file-1" });
    // A file space is not the /space storage prefix — pointing there would
    // send the agent to a path that resolves to nothing.
    expect(JSON.stringify(slice)).not.toContain("/space/");
  });

  it("omits a size it was not given rather than reporting zero", () => {
    const slice = buildSpaceDataFileSlice({
      fileId: "file-1",
      mimeType: "image/png",
      name: "logo.png",
      sizeBytes: null,
    });
    expect(slice.page && "file_size_bytes" in slice.page).toBe(false);
  });
});

describe("buildSpaceDataFileTextSlice", () => {
  it("describes the contents as belonging to the named file", () => {
    const slice = buildSpaceDataFileTextSlice({
      mimeType: "text/markdown",
      name: "notes.md",
      text: "# Coastal research notes",
    });
    expect(slice.app_context?.[0]?.description).toContain("notes.md");
    expect(slice.app_context?.[0]?.value).toBe("# Coastal research notes");
  });
});

describe("buildSpaceDataArtifactSlice", () => {
  it("tells the agent an app artifact is a running App, with its app_id", () => {
    const slice = buildSpaceDataArtifactSlice({
      artifactId: "artifact-1",
      content: JSON.stringify({
        app_id: "app-42",
        app_version: 3,
        session_id: "chat-1",
      }),
      title: "Test",
      type: "app",
      version: 1,
    });
    expect(slice.app_context?.[0]?.value).toContain("running engenty App");
    expect(slice.app_context?.[0]?.value).toContain("app-42");
    expect(slice.page).toMatchObject({
      app_id: "app-42",
      artifact_id: "artifact-1",
      artifact_type: "app",
      artifact_version: 1,
      page_title: "Test",
    });
    expect(slice.selection).toEqual({ entity_id: "artifact-1" });
  });

  it("excerpts a text artifact instead of describing a handle", () => {
    const slice = buildSpaceDataArtifactSlice({
      artifactId: "artifact-2",
      content: "# Findings\nThe coast is clear.",
      title: "Findings",
      type: "markdown",
      version: 2,
    });
    expect(slice.app_context?.[0]?.value).toContain("The coast is clear.");
    expect(slice.page && "app_id" in slice.page).toBe(false);
  });

  it("survives an app handle that is not JSON, and empty content", () => {
    const broken = buildSpaceDataArtifactSlice({
      artifactId: "artifact-3",
      content: "not json",
      title: "Broken",
      type: "app",
      version: 1,
    });
    expect(broken.page && "app_id" in broken.page).toBe(false);
    const empty = buildSpaceDataArtifactSlice({
      artifactId: "artifact-4",
      content: null,
      title: "Empty",
      type: "markdown",
      version: 1,
    });
    expect(empty.app_context).toEqual([]);
  });

  it("leaves selection.entity_type empty — an artifact has no owning module", () => {
    const slice = buildSpaceDataArtifactSlice({
      artifactId: "artifact-5",
      content: null,
      title: "X",
      type: "app",
      version: 1,
    });
    expect(slice.selection && "entity_type" in slice.selection).toBe(false);
  });
});
