/**
 * The `/data` mount as a real filesystem (P1.5).
 *
 * The test this file exists for is `mkdir` → `readdir`: the wrapper it replaces
 * no-opped `mkdir`, so an agent got success, listed the folder, found nothing,
 * and called `mkdir` again. Everything else here guards the same principle —
 * that a refusal reaches the agent as a refusal rather than as a silent
 * success.
 */
import { describe, expect, it, vi } from "vitest";
import { SpaceDataFilesystem } from "../space-data-filesystem.js";

const STAMP = "2026-08-17T10:00:00Z";

interface FakeState {
  folders: Set<string>;
  nodes: Map<string, string>;
}

/**
 * A fake of the HTTP ENDPOINTS, not of the client.
 *
 * The filesystem's contract is which endpoint it calls with what, so faking one
 * layer lower would test core's routes instead of the mapping.
 */
function fakeCore(initial?: Partial<FakeState>) {
  const state: FakeState = {
    folders: new Set(initial?.folders ?? ["Files"]),
    nodes: new Map(initial?.nodes ?? []),
  };
  const calls: Array<{ body?: unknown; method: string; url: string }> = [];

  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ body, method, url: String(url) });
    const parsed = new URL(String(url));
    const endpoint = parsed.pathname.split("/data/")[1] ?? "";
    const path = parsed.searchParams.get("path") ?? "";

    const ok = (data: unknown) =>
      new Response(JSON.stringify({ data, ok: true }), { status: 200 });
    const fail = (status: number, code: string, message: string) =>
      new Response(JSON.stringify({ error: { code, message }, ok: false }), {
        status,
      });

    if (endpoint === "roots") {
      return ok([
        { label: "Files", moduleId: "files", root: "Files", writable: true },
        {
          label: "Contacts",
          moduleId: "contacts",
          root: "Contacts",
          writable: true,
        },
      ]);
    }
    if (endpoint.startsWith("list")) {
      if (!(path === "" || state.folders.has(path))) {
        return fail(404, "not_found", `No folder ${path}`);
      }
      const depth = path.split("/").length;
      return ok({
        entries: [...state.nodes.keys()]
          .filter(
            (node) =>
              node.startsWith(`${path}/`) &&
              node.split("/").length === depth + 1
          )
          .map((node) => ({
            kind: "record",
            name: node.split("/").at(-1),
            path: node,
            recordId: node,
            version: STAMP,
          })),
        folders: [...state.folders]
          .filter(
            (folder) =>
              folder.startsWith(`${path}/`) &&
              folder.split("/").length === depth + 1
          )
          .map((folder) => ({ name: folder.split("/").at(-1), path: folder })),
      });
    }
    if (endpoint.startsWith("read")) {
      const content = state.nodes.get(path);
      if (content === undefined) {
        return fail(404, "not_found", `No node ${path}`);
      }
      return ok({
        kind: "record",
        members: [
          {
            content,
            contentType: "text/markdown",
            derived: false,
            editable: true,
            encoding: "utf8",
            name: path.split("/").at(-1),
          },
        ],
        name: path.split("/").at(-1),
        nodeType: "files.file",
        path,
        recordId: path,
        updatedAt: STAMP,
        version: STAMP,
      });
    }
    if (endpoint === "create") {
      const full = `${body.parent_path}/${body.name}`;
      if (body.parent_path.startsWith("Contacts")) {
        return fail(
          405,
          "not_supported",
          "Nothing new can be made in Contacts from the data tree — use the module's own action."
        );
      }
      if (state.folders.has(full)) {
        return fail(409, "data_conflict", "already there");
      }
      if (body.kind === "folder") {
        state.folders.add(full);
      } else {
        state.nodes.set(full, body.content ?? "");
      }
      return ok({
        kind: body.kind === "folder" ? "bundle" : "record",
        members: [],
        name: body.name,
        nodeType: "files.folder",
        path: full,
        recordId: full,
        updatedAt: STAMP,
        version: STAMP,
      });
    }
    if (endpoint === "delete") {
      if (state.folders.has(body.path)) {
        state.folders.delete(body.path);
        return ok({ deleted: true });
      }
      if (state.nodes.has(body.path)) {
        state.nodes.delete(body.path);
        return ok({ deleted: true });
      }
      return fail(404, "not_found", "nothing there");
    }
    if (endpoint === "write") {
      state.nodes.set(body.path, body.content);
      return ok({
        kind: "record",
        members: [],
        name: body.path.split("/").at(-1),
        nodeType: "files.file",
        path: body.path,
        recordId: body.path,
        version: STAMP,
      });
    }
    if (endpoint === "move") {
      const content = state.nodes.get(body.path) ?? "";
      state.nodes.delete(body.path);
      const parent =
        body.to_parent_path ?? body.path.split("/").slice(0, -1).join("/");
      const name = body.new_name ?? body.path.split("/").at(-1);
      state.nodes.set(`${parent}/${name}`, content);
      return ok({
        kind: "record",
        members: [],
        name,
        nodeType: "files.file",
        path: `${parent}/${name}`,
        recordId: `${parent}/${name}`,
        version: STAMP,
      });
    }
    return fail(404, "not_found", `unhandled ${endpoint}`);
  }) as unknown as typeof fetch;

  return { calls, fetchImpl, state };
}

function filesystem(core: ReturnType<typeof fakeCore>, readOnly = false) {
  return new SpaceDataFilesystem({
    accessToken: "token",
    coreBaseUrl: "https://core.test",
    fetchImpl: core.fetchImpl,
    readOnly,
    spaceId: "space-1",
  });
}

describe("mkdir makes a REAL folder", () => {
  it("creates a folder that readdir then shows — the no-op regression", async () => {
    // The whole reason this filesystem replaced FilesSDKFilesystem: its mkdir
    // was a documented no-op, so the agent looped.
    const core = fakeCore();
    const fs = filesystem(core);
    await fs.mkdir("/Files/Verträge");
    const entries = await fs.readdir("/Files");
    expect(entries).toContainEqual({ name: "Verträge", type: "directory" });
  });

  it("creates each missing level separately when recursive", async () => {
    // One approval per level, deliberately: an endpoint that made four folders
    // from one call would be one approval covering four changes.
    const core = fakeCore();
    const fs = filesystem(core);
    await fs.mkdir("/Files/a/b/c", { recursive: true });
    const creates = core.calls.filter((call) => call.url.endsWith("/create"));
    expect(creates).toHaveLength(3);
    expect(await fs.readdir("/Files/a/b")).toContainEqual({
      name: "c",
      type: "directory",
    });
  });

  it("treats an existing level as the desired state under recursive", async () => {
    const core = fakeCore({ folders: new Set(["Files", "Files/a"]) });
    const fs = filesystem(core);
    await expect(
      fs.mkdir("/Files/a/b", { recursive: true })
    ).resolves.toBeUndefined();
  });

  it("REFUSES where the module has no folders, instead of pretending", async () => {
    // Contacts answers 405. Surfacing that is strictly better than a silent
    // success, because it is actionable.
    const core = fakeCore();
    const fs = filesystem(core);
    await expect(fs.mkdir("/Contacts/People")).rejects.toThrow(
      /module's own action/
    );
  });

  it("keeps a legacy non-module path reachable through the 404 guard", async () => {
    const core = fakeCore();
    const fs = filesystem(core);
    await fs.mkdir("/sfg-angebot");
    expect(await fs.readdir("/Files")).toContainEqual({
      name: "sfg-angebot",
      type: "directory",
    });
  });

  it("refuses to make a folder at the top level, which is the mount list", async () => {
    const core = fakeCore();
    const fs = filesystem(core);
    await expect(fs.mkdir("/Invented")).rejects.toThrow(/modules this space/);
  });
});

describe("the tree's root is the mounted modules", () => {
  it("lists each mounted module as a directory", async () => {
    const core = fakeCore();
    const fs = filesystem(core);
    expect(await fs.readdir("/")).toEqual([
      { name: "Files", type: "directory" },
      { name: "Contacts", type: "directory" },
    ]);
  });
});

describe("reading and writing go through the operation pipeline", () => {
  it("reads a node's bytes", async () => {
    const core = fakeCore({ nodes: new Map([["Files/a.md", "# hallo"]]) });
    const fs = filesystem(core);
    expect(await fs.readFile("/Files/a.md", { encoding: "utf8" })).toBe(
      "# hallo"
    );
  });

  it("reads the version first so the SERVER can refuse a concurrent edit", async () => {
    const core = fakeCore({ nodes: new Map([["Files/a.md", "old"]]) });
    const fs = filesystem(core);
    await fs.writeFile("/Files/a.md", "new");
    const write = core.calls.find((call) => call.url.endsWith("/write"));
    expect((write?.body as { base_version?: string })?.base_version).toBe(
      STAMP
    );
  });

  it("appends by reading then writing the whole node", async () => {
    const core = fakeCore({ nodes: new Map([["Files/a.md", "one"]]) });
    const fs = filesystem(core);
    await fs.appendFile("/Files/a.md", "-two");
    expect(core.state.nodes.get("Files/a.md")).toBe("one-two");
  });

  it("blocks every write when the mount is read-only", async () => {
    const core = fakeCore({ nodes: new Map([["Files/a.md", "x"]]) });
    const fs = filesystem(core, true);
    await expect(fs.writeFile("/Files/a.md", "y")).rejects.toThrow(/read-only/);
    await expect(fs.mkdir("/Files/b")).rejects.toThrow(/read-only/);
    await expect(fs.rmdir("/Files/b")).rejects.toThrow(/read-only/);
  });
});

describe("move, copy and delete", () => {
  it("moves a node to a new parent and name in one call", async () => {
    const core = fakeCore({
      folders: new Set(["Files", "Files/Archiv"]),
      nodes: new Map([["Files/a.md", "x"]]),
    });
    const fs = filesystem(core);
    await fs.moveFile("/Files/a.md", "/Files/Archiv/b.md");
    const move = core.calls.find((call) => call.url.endsWith("/move"));
    expect(move?.body).toMatchObject({
      new_name: "b.md",
      path: "Files/a.md",
      to_parent_path: "Files/Archiv",
    });
  });

  it("copies by composing read and create, never a module `copy`", async () => {
    // A copy a module implemented would be a second way to mint a record,
    // sidestepping the schema its own create applies.
    const core = fakeCore({ nodes: new Map([["Files/a.md", "content"]]) });
    const fs = filesystem(core);
    await fs.copyFile("/Files/a.md", "/Files/b.md");
    expect(core.state.nodes.get("Files/b.md")).toBe("content");
    expect(core.calls.some((call) => call.url.includes("/copy"))).toBe(false);
  });

  it("passes the caller's recursive flag through to the module", async () => {
    // The cascade lives in the adapter; the point is that the flag the caller
    // set is the flag the module sees.
    const core = fakeCore({ folders: new Set(["Files", "Files/a"]) });
    const fs = filesystem(core);
    await fs.rmdir("/Files/a", { recursive: true });
    const remove = core.calls.find((call) => call.method === "DELETE");
    expect((remove?.body as { recursive?: boolean })?.recursive).toBe(true);
  });

  it("does not cascade unless asked", async () => {
    const core = fakeCore({ folders: new Set(["Files", "Files/a"]) });
    const fs = filesystem(core);
    await fs.rmdir("/Files/a");
    const remove = core.calls.find((call) => call.method === "DELETE");
    expect((remove?.body as { recursive?: boolean })?.recursive).toBe(false);
  });

  it("swallows a missing target only when force is set", async () => {
    const core = fakeCore();
    const fs = filesystem(core);
    await expect(fs.deleteFile("/Files/ghost.md")).rejects.toThrow();
    await expect(
      fs.deleteFile("/Files/ghost.md", { force: true })
    ).resolves.toBeUndefined();
  });
});

describe("exists and stat see folders as well as nodes", () => {
  it("finds a folder, which only a listing can reveal", async () => {
    const core = fakeCore({ folders: new Set(["Files", "Files/a"]) });
    const fs = filesystem(core);
    expect(await fs.exists("/Files/a")).toBe(true);
    expect((await fs.stat("/Files/a")).type).toBe("directory");
  });

  it("finds a node and reports its size and type", async () => {
    const core = fakeCore({ nodes: new Map([["Files/a.md", "12345"]]) });
    const fs = filesystem(core);
    const stat = await fs.stat("/Files/a.md");
    expect(stat.type).toBe("file");
    expect(stat.size).toBe(5);
  });

  it("says no for something that is neither", async () => {
    const core = fakeCore();
    const fs = filesystem(core);
    expect(await fs.exists("/Files/ghost")).toBe(false);
  });
});

describe("mount instructions", () => {
  it("tells the agent Space uploads live under /data/Files", () => {
    const fs = filesystem(fakeCore());
    expect(fs.getInstructions()).toContain("/data/Files");
    expect(fs.getInstructions()).toContain("does not index /data");
  });
});
