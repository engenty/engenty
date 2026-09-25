import { describe, expect, it } from "vitest";
import {
  createPagesSpaceDataAdapter,
  PAGE_EXTENSION,
  PAGES_PAGE_NODE_TYPE,
} from "./pages-adapter.js";
import {
  type PageArtifactRow,
  type PageArtifactType,
  type PagesStore,
  PagesVersionConflictError,
} from "./pages-store.js";

const STAMP = "2026-08-26T10:00:00Z";

function row(input: {
  id: string;
  parentId?: string | null;
  title: string;
  type: PageArtifactType;
  version?: number;
}): PageArtifactRow {
  return {
    created_at: STAMP,
    current_version: input.version ?? 1,
    id: input.id,
    parent_id: input.parentId ?? null,
    scope_id: "space-1",
    status: "active",
    title: input.title,
    type: input.type,
    updated_at: STAMP,
  };
}

function memoryStore(): PagesStore & {
  contents: Map<string, string>;
  rows: PageArtifactRow[];
} {
  const rows: PageArtifactRow[] = [];
  const contents = new Map<string, string>();
  let seq = 0;
  const scoped = (artifactId: string) =>
    rows.find(
      (candidate) =>
        candidate.id === artifactId && candidate.status === "active"
    ) ?? null;

  const store: PagesStore & {
    contents: Map<string, string>;
    rows: PageArtifactRow[];
  } = {
    contents,
    rows,
    async list(input) {
      return rows.filter(
        (candidate) =>
          candidate.status === "active" &&
          candidate.scope_id === input.spaceId &&
          candidate.parent_id === input.parentId
      );
    },
    async get(input) {
      const found = scoped(input.artifactId);
      return found?.scope_id === input.spaceId ? found : null;
    },
    async getContent(input) {
      const found = scoped(input.artifactId);
      if (!(found && found.scope_id === input.spaceId)) {
        return null;
      }
      return { content: contents.get(found.id) ?? "", row: found };
    },
    async create(input) {
      seq += 1;
      const created = row({
        id: `p${seq}`,
        parentId: input.parentId,
        title: input.title,
        type: input.type,
      });
      rows.push(created);
      contents.set(created.id, input.content);
      return created;
    },
    async addVersion(input) {
      const found = scoped(input.artifactId);
      if (!found) {
        throw new Error("missing");
      }
      if (found.current_version !== input.expectedVersion) {
        throw new PagesVersionConflictError(found.current_version);
      }
      found.current_version += 1;
      contents.set(found.id, input.content);
      return found;
    },
    async update(input) {
      const found = scoped(input.artifactId);
      if (!found) {
        return null;
      }
      if (input.parentId !== undefined) {
        found.parent_id = input.parentId;
      }
      if (input.title !== undefined) {
        found.title = input.title;
      }
      return found;
    },
    async archive(input) {
      const found = scoped(input.artifactId);
      if (found) {
        found.status = "archived";
      }
    },
  };
  return store;
}

const ctx = {
  invokeOperation: async () => {
    throw new Error("Pages must not call invokeOperation");
  },
  recordScope: "all" as const,
  spaceId: "space-1",
  tenantId: "tenant-1",
};

describe("the Pages adapter", () => {
  it("lists pages and folders under paths the other operations accept", async () => {
    const store = memoryStore();
    store.rows.push(
      row({ id: "aaaa-1111", title: "Notes", type: "markdown" }),
      row({ id: "bbbb-2222", title: "Briefs", type: "folder" })
    );
    store.contents.set("aaaa-1111", "# hi");
    const adapter = createPagesSpaceDataAdapter({ store });
    const listing = await adapter.list(ctx, "");
    const page = listing.entries[0];
    const folder = listing.folders[0];
    if (!(page && folder)) {
      throw new Error("expected a page and a folder");
    }
    expect(page.nodeType).toBe(PAGES_PAGE_NODE_TYPE);
    expect(folder.nodeType).toBe("pages.folder");

    const read = await adapter.read(ctx, page.path);
    expect(read.members[0]?.content).toBe("# hi");
    const inside = await adapter.list(ctx, folder.path);
    expect(inside.entries).toEqual([]);
  });

  it("creates a markdown page at the root and a folder beneath it", async () => {
    const store = memoryStore();
    const adapter = createPagesSpaceDataAdapter({ store });
    if (!adapter.createNode) {
      throw new Error("expected createNode");
    }
    const page = await adapter.createNode(ctx, {
      kind: "node",
      name: "New page",
      parentPath: "",
    });
    expect(page.nodeType).toBe(PAGES_PAGE_NODE_TYPE);
    expect(page.members[0]?.contentType).toBe("text/markdown");
    expect(page.path.endsWith(PAGE_EXTENSION)).toBe(true);

    const folder = await adapter.createNode(ctx, {
      kind: "folder",
      name: "New folder",
      parentPath: "",
    });
    expect(folder.nodeType).toBe("pages.folder");
    expect(store.rows.map((candidate) => candidate.type).sort()).toEqual([
      "folder",
      "markdown",
    ]);
  });

  it("writes a new version and refuses a stale one", async () => {
    const store = memoryStore();
    store.rows.push(row({ id: "aaaa-1111", title: "Notes", type: "markdown" }));
    store.contents.set("aaaa-1111", "# hi");
    const adapter = createPagesSpaceDataAdapter({ store });
    if (!adapter.write) {
      throw new Error("expected write");
    }
    const saved = await adapter.write(ctx, {
      baseVersion: "1",
      content: "# hello",
      path: `notes__aaaa-1111${PAGE_EXTENSION}`,
    });
    expect(saved.version).toBe("2");
    expect(store.contents.get("aaaa-1111")).toBe("# hello");

    await expect(
      adapter.write(ctx, {
        baseVersion: "1",
        content: "stale",
        path: `notes__aaaa-1111${PAGE_EXTENSION}`,
      })
    ).rejects.toMatchObject({ code: "data_conflict", status: 409 });
  });

  it("refuses a non-recursive delete of a folder that still has pages", async () => {
    const store = memoryStore();
    store.rows.push(
      row({ id: "fold-1", title: "Briefs", type: "folder" }),
      row({
        id: "page-1",
        parentId: "fold-1",
        title: "Q3",
        type: "markdown",
      })
    );
    const adapter = createPagesSpaceDataAdapter({ store });
    if (!adapter.deleteNode) {
      throw new Error("expected deleteNode");
    }
    await expect(
      adapter.deleteNode(ctx, { path: "briefs__fold-1" })
    ).rejects.toMatchObject({ code: "not_supported" });
    await adapter.deleteNode(ctx, { path: "briefs__fold-1", recursive: true });
    expect(
      store.rows.every((candidate) => candidate.status === "archived")
    ).toBe(true);
  });

  it("moves a page into a folder by rewriting parent_id", async () => {
    const store = memoryStore();
    store.rows.push(
      row({ id: "aaaa-1111", title: "Notes", type: "markdown" }),
      row({ id: "bbbb-2222", title: "Briefs", type: "folder" })
    );
    store.contents.set("aaaa-1111", "");
    const adapter = createPagesSpaceDataAdapter({ store });
    if (!adapter.moveNode) {
      throw new Error("expected moveNode");
    }
    const moved = await adapter.moveNode(ctx, {
      path: `notes__aaaa-1111${PAGE_EXTENSION}`,
      toParentPath: "briefs__bbbb-2222",
    });
    expect(moved.path).toBe(
      `briefs__bbbb-2222/notes__aaaa-1111${PAGE_EXTENSION}`
    );
    expect(store.rows[0]?.parent_id).toBe("bbbb-2222");
  });
});
