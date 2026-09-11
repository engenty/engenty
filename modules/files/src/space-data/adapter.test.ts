import { describe, expect, it, vi } from "vitest";
import { createFilesSpaceDataAdapter } from "./adapter.js";

interface FolderRow {
  connectionId?: string;
  id: string;
  name: string;
  parentId: string | null;
  source?: string;
  updatedAt: string;
}

interface FileRow {
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

const STAMP = "2026-08-17T10:00:00Z";

function folder(name: string, id: string, parentId: string | null): FolderRow {
  return { id, name, parentId, updatedAt: STAMP };
}

function file(name: string, id: string, folderId: string | null): FileRow {
  return {
    folderId,
    id,
    mimeType: "text/markdown",
    name,
    sizeBytes: 12,
    updatedAt: STAMP,
  };
}

/**
 * A file space in memory, addressed the way the operations address it.
 *
 * Deliberately a fake of the OPERATIONS rather than of the file source: the
 * adapter's whole contract is which operation it calls with what, so a fake one
 * layer lower would test the file manager instead of the projection.
 */
function fakeSpace(input: { files: FileRow[]; folders: FolderRow[] }) {
  const state = { files: [...input.files], folders: [...input.folders] };
  const invoke = vi.fn(async (op: string, payload?: unknown) => {
    const body = (payload ?? {}) as Record<string, unknown>;
    if (op === "files_space_list") {
      const parent = (body.folder_id ?? null) as string | null;
      return {
        files: state.files.filter((row) => row.folderId === parent),
        folders: state.folders.filter((row) => row.parentId === parent),
      };
    }
    if (op === "files_space_write") {
      const row = state.files.find(
        (candidate) => candidate.id === body.file_id
      );
      return row;
    }
    if (op === "files_space_read") {
      const row = state.files.find(
        (candidate) => candidate.id === body.file_id
      );
      return { content: "# hello", encoding: "utf8", file: row };
    }
    if (op === "files_space_folder_create") {
      const row = folder(
        body.name as string,
        `new-${state.folders.length + 1}`,
        (body.parent_id ?? null) as string | null
      );
      state.folders.push(row);
      return row;
    }
    if (op === "files_space_folder_move") {
      const row = state.folders.find(
        (candidate) => candidate.id === body.folder_id
      );
      if (!row) {
        return null;
      }
      if (body.name !== undefined) {
        row.name = body.name as string;
      }
      if (body.parent_id !== undefined) {
        row.parentId = body.parent_id as string | null;
      }
      return row;
    }
    if (op === "files_space_file_move") {
      const row = state.files.find(
        (candidate) => candidate.id === body.file_id
      );
      if (!row) {
        return null;
      }
      if (body.name !== undefined) {
        row.name = body.name as string;
      }
      if (body.folder_id !== undefined) {
        row.folderId = body.folder_id as string | null;
      }
      return row;
    }
    throw new Error(`unexpected operation ${op}`);
  });
  return {
    ctx: {
      invokeOperation: invoke,
      recordScope: "space" as const,
      spaceId: "space-1",
      tenantId: "tenant-1",
    },
    invoke,
    state,
  };
}

const adapter = createFilesSpaceDataAdapter();

describe("the root a space's own files occupy", () => {
  it("declares BOTH record scopes, unlike contacts", () => {
    // A space's file space is addressed BY the space (owner_type='space'), so
    // "everything" and "this space" name the same set. Contacts carry no
    // space_id at all, which is why a space-scoped mount of them hides the root.
    expect(adapter.recordScopes).toEqual(["all", "space"]);
    expect(adapter.root).toBe("Files");
  });

  it("matches any file name at all through one catch-all node type", () => {
    // The point of a file space is that a file is any type, so the generic type
    // has to exist rather than every extension being enumerated up front.
    expect(adapter.nodeTypes).toHaveLength(1);
    expect(adapter.nodeTypes[0]?.extension).toBe("");
  });
});

describe("listing", () => {
  it("names a file so its path carries its id, and shows the real name as the title", async () => {
    const space = fakeSpace({
      files: [file("notizen.md", "aaaa-1111", null)],
      folders: [],
    });
    const listing = await adapter.list(space.ctx, "");
    expect(listing.entries[0]?.name).toBe("notizen__aaaa-1111.md");
    expect(listing.entries[0]?.title).toBe("notizen.md");
    expect(listing.entries[0]?.path).toBe("notizen__aaaa-1111.md");
  });

  it("leaves a folder's name plain, because sibling folder names are unique", async () => {
    const space = fakeSpace({
      files: [],
      folders: [folder("Verträge", "f-1", null)],
    });
    const listing = await adapter.list(space.ctx, "");
    expect(listing.folders[0]?.path).toBe("Verträge");
  });

  it("carries a mount's connection so Get Info can name the original folder", async () => {
    const space = fakeSpace({
      files: [],
      folders: [
        {
          connectionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          id: "f-mount",
          name: "deploy",
          parentId: null,
          source: "local",
          updatedAt: STAMP,
        },
      ],
    });
    const listing = await adapter.list(space.ctx, "");
    expect(listing.folders[0]?.nodeType).toBe("files.mount");
    expect(listing.folders[0]?.connectionId).toBe(
      "3fa85f64-5717-4562-b3fc-2c963f66afa6"
    );
  });

  it("walks into a folder by name, case-insensitively like the unique index", async () => {
    const space = fakeSpace({
      files: [file("mietvertrag.pdf", "bbbb-2222", "f-1")],
      folders: [folder("Verträge", "f-1", null)],
    });
    const listing = await adapter.list(space.ctx, "verträge");
    expect(listing.entries[0]?.path).toBe(
      "verträge/mietvertrag__bbbb-2222.pdf"
    );
  });

  it("404s a folder that is not there rather than listing the root", async () => {
    const space = fakeSpace({ files: [], folders: [] });
    await expect(adapter.list(space.ctx, "Nope")).rejects.toThrow(/No folder/);
  });
});

describe("reading", () => {
  it("refuses a path whose last segment carries no id", async () => {
    // Two files may share a name — nothing in the schema stops it — so
    // resolving `notizen.md` by picking the first match would open a different
    // file than the caller asked for, silently.
    const space = fakeSpace({
      files: [file("notizen.md", "aaaa-1111", null)],
      folders: [],
    });
    await expect(adapter.read(space.ctx, "notizen.md")).rejects.toThrow(
      /carries its id/
    );
  });

  it("reads the bytes through the module's own operation", async () => {
    const space = fakeSpace({
      files: [file("notizen.md", "aaaa-1111", null)],
      folders: [],
    });
    const document = await adapter.read(space.ctx, "notizen__aaaa-1111.md");
    expect(document.members[0]?.content).toBe("# hello");
    expect(document.version).toBe(STAMP);
    expect(space.invoke).toHaveBeenCalledWith("files_space_read", {
      file_id: "aaaa-1111",
      space_id: "space-1",
    });
  });
});

describe("creating", () => {
  it("makes a folder and answers with where it landed", async () => {
    const space = fakeSpace({
      files: [],
      folders: [folder("Verträge", "f-1", null)],
    });
    const created = await adapter.createNode?.(space.ctx, {
      kind: "folder",
      name: "2026",
      parentPath: "Verträge",
    });
    expect(created?.path).toBe("Verträge/2026");
    expect(space.invoke).toHaveBeenCalledWith("files_space_folder_create", {
      name: "2026",
      parent_id: "f-1",
      space_id: "space-1",
    });
  });

  it("creates at the file root when the parent is the root itself", async () => {
    const space = fakeSpace({ files: [], folders: [] });
    const created = await adapter.createNode?.(space.ctx, {
      kind: "folder",
      name: "Verträge",
      parentPath: "",
    });
    expect(created?.path).toBe("Verträge");
    expect(space.invoke).toHaveBeenCalledWith("files_space_folder_create", {
      name: "Verträge",
      parent_id: null,
      space_id: "space-1",
    });
  });

  it("refuses to mint a FILE, and says what to do instead", async () => {
    const space = fakeSpace({ files: [], folders: [] });
    await expect(
      adapter.createNode?.(space.ctx, {
        kind: "node",
        name: "notizen.md",
        parentPath: "",
      })
    ).rejects.toThrow(/upload/);
  });
});

describe("moving", () => {
  it("moves a file into a folder, branching on the id its name carries", async () => {
    const space = fakeSpace({
      files: [file("mietvertrag.pdf", "bbbb-2222", null)],
      folders: [folder("Verträge", "f-1", null)],
    });
    const moved = await adapter.moveNode?.(space.ctx, {
      path: "mietvertrag__bbbb-2222.pdf",
      toParentPath: "Verträge",
    });
    expect(moved?.path).toBe("Verträge/mietvertrag__bbbb-2222.pdf");
    expect(space.invoke).toHaveBeenCalledWith("files_space_file_move", {
      file_id: "bbbb-2222",
      folder_id: "f-1",
      space_id: "space-1",
    });
  });

  it("renames a file in place, keeping its parent", async () => {
    const space = fakeSpace({
      files: [file("alt.md", "bbbb-2222", "f-1")],
      folders: [folder("Verträge", "f-1", null)],
    });
    const moved = await adapter.moveNode?.(space.ctx, {
      newName: "neu.md",
      path: "Verträge/alt__bbbb-2222.md",
    });
    expect(moved?.path).toBe("Verträge/neu__bbbb-2222.md");
  });

  it("answers a move with the file's REAL bytes, not an empty member", async () => {
    // A record document carries exactly one member holding its bytes, so an
    // empty one after a rename would claim the file is empty — the one thing
    // the document exists to say, said wrongly.
    const space = fakeSpace({
      files: [file("alt.md", "bbbb-2222", null)],
      folders: [],
    });
    const moved = await adapter.moveNode?.(space.ctx, {
      newName: "neu.md",
      path: "alt__bbbb-2222.md",
    });
    expect(moved?.members[0]?.content).toBe("# hello");
  });

  it("moves a FOLDER when the segment carries no id", async () => {
    const space = fakeSpace({
      files: [],
      folders: [folder("Verträge", "f-1", null), folder("Archiv", "f-2", null)],
    });
    const moved = await adapter.moveNode?.(space.ctx, {
      path: "Verträge",
      toParentPath: "Archiv",
    });
    expect(moved?.path).toBe("Archiv/Verträge");
    expect(space.invoke).toHaveBeenCalledWith("files_space_folder_move", {
      folder_id: "f-1",
      parent_id: "f-2",
      space_id: "space-1",
    });
  });

  it("refuses to move the file root itself", async () => {
    const space = fakeSpace({ files: [], folders: [] });
    await expect(
      adapter.moveNode?.(space.ctx, { newName: "x", path: "" })
    ).rejects.toThrow(/names nothing/);
  });
});

describe("saving an edit", () => {
  it("passes the base version straight through as the file's expected version", async () => {
    // The tree inherits the file manager's existing conflict answer rather than
    // growing a second one: a 409 here and a 409 in the editor are the same
    // refusal about the same row.
    const space = fakeSpace({
      files: [file("notizen.md", "aaaa-1111", null)],
      folders: [],
    });
    await adapter.write?.(space.ctx, {
      baseVersion: STAMP,
      content: "# neu",
      path: "notizen__aaaa-1111.md",
    });
    expect(space.invoke).toHaveBeenCalledWith("files_space_write", {
      content: "# neu",
      expected_version: STAMP,
      file_id: "aaaa-1111",
      space_id: "space-1",
    });
  });

  it("refuses a path that names no file", async () => {
    const space = fakeSpace({ files: [], folders: [] });
    await expect(
      adapter.write?.(space.ctx, {
        baseVersion: STAMP,
        content: "x",
        path: "notizen.md",
      })
    ).rejects.toThrow(/carries its id/);
  });
});
