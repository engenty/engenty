import type {
  FileStorageFile,
  FileStorageService,
} from "@engenty/file-storage";
import type { SpaceDataContext } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { createSpaceFolderAdapters } from "./space-folder-adapter.js";

const T = "t1";
const S = "s1";
const COMMONS = `tenants/${T}/spaces/${S}/ai/workspace/commons`;

/** Storage as a map of key → bytes, with the folder-aware listing core uses. */
function memoryStorage(seed: Record<string, string>) {
  const objects = new Map<string, { bytes: Uint8Array; updated: string }>(
    Object.entries(seed).map(([key, text]) => [
      key,
      { bytes: new TextEncoder().encode(text), updated: "v1" },
    ])
  );
  const fileOf = (key: string): FileStorageFile => ({
    created_at: "v0",
    filename: key.split("/").pop() ?? key,
    key,
    mime_type: key.endsWith(".csv") ? "text/csv" : "application/octet-stream",
    size_bytes: objects.get(key)?.bytes.byteLength ?? 0,
    updated_at: objects.get(key)?.updated ?? "",
  });
  const service = {
    copy: async (src: string, dest: string) => {
      const object = objects.get(src);
      if (object) {
        objects.set(dest, { ...object });
      }
      return fileOf(dest);
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    download: async (key: string) => objects.get(key)?.bytes ?? null,
    exists: async (key: string) => objects.has(key),
    getFile: async (key: string) => (objects.has(key) ? fileOf(key) : null),
    getUrl: async (key: string) => key,
    list: async () => ({ files: [], total: 0 }),
    listChildren: async (prefix: string) => {
      const files: FileStorageFile[] = [];
      const folders = new Map<string, string>();
      for (const key of objects.keys()) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        const [head, ...rest] = key.slice(prefix.length).split("/");
        if (rest.length === 0) {
          files.push(fileOf(key));
        } else if (head) {
          folders.set(head, `${prefix}${head}/`);
        }
      }
      return {
        files,
        folders: [...folders].map(([name, folderPrefix]) => ({
          name,
          prefix: folderPrefix,
        })),
      };
    },
    upload: async (key: string, data: Uint8Array) => {
      objects.set(key, { bytes: data, updated: "v2" });
      return fileOf(key);
    },
  } as unknown as FileStorageService;
  return { objects, service };
}

const ctx: SpaceDataContext = {
  invokeOperation: () => Promise.reject(new Error("not used")),
  recordScope: "all",
  spaceId: S,
  tenantId: T,
};

function publicFolder(seed: Record<string, string>) {
  const storage = memoryStorage(seed);
  const adapter = createSpaceFolderAdapters(() => storage.service).find(
    (entry) => entry.root === "Public"
  );
  if (!adapter) {
    throw new Error("no Public root");
  }
  return { adapter, objects: storage.objects };
}

describe("space folder adapter", () => {
  it("lists the Space's public folder — the bytes /space/public shows on a computer", async () => {
    const { adapter } = publicFolder({
      [`${COMMONS}/public/offer.csv`]: "a,b",
      [`${COMMONS}/public/offer.csv.extracted.md`]: "sidecar",
      [`${COMMONS}/public/drafts/.keep`]: "",
      [`${COMMONS}/public/drafts/note.csv`]: "x",
      [`${COMMONS}/agent/contacts.manager/uploads/in.csv`]: "not public",
      [`tenants/${T}/spaces/other/ai/workspace/commons/public/x.csv`]: "",
    });
    const root = await adapter.list(ctx, "");
    expect(root.entries.map((entry) => entry.name)).toEqual(["offer.csv"]);
    expect(root.folders.map((folder) => folder.path)).toEqual(["drafts"]);
    const drafts = await adapter.list(ctx, "drafts");
    expect(drafts.entries.map((entry) => entry.path)).toEqual([
      "drafts/note.csv",
    ]);
  });

  it("finds files at any depth by name, ignoring case and accents, and never another folder's", async () => {
    const { adapter } = publicFolder({
      [`${COMMONS}/public/Angebot-Müller.csv`]: "a",
      [`${COMMONS}/public/drafts/2026/angebot-v2.csv`]: "b",
      [`${COMMONS}/public/drafts/note.csv`]: "c",
      [`${COMMONS}/agent/contacts.manager/work/angebot.csv`]: "not public",
    });
    const found = await adapter.search?.(ctx, {
      limit: 25,
      query: "ANGEBOT-MULLER",
    });
    expect(found?.entries.map((entry) => entry.path)).toEqual([
      "Angebot-Müller.csv",
    ]);
    const nested = await adapter.search?.(ctx, { limit: 25, query: "angebot" });
    expect(nested?.entries.map((entry) => entry.path).sort()).toEqual([
      "Angebot-Müller.csv",
      "drafts/2026/angebot-v2.csv",
    ]);
  });

  it("refuses a path that climbs out of the folder", async () => {
    const { adapter } = publicFolder({});
    await expect(adapter.read(ctx, "../agent/x.csv")).rejects.toThrow();
    await expect(adapter.list(ctx, "a/../../public")).rejects.toThrow();
  });

  it("refuses a write over a version the writer did not read", async () => {
    const { adapter, objects } = publicFolder({
      [`${COMMONS}/public/offer.csv`]: "a,b",
    });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "stale",
        content: "c,d",
        path: "offer.csv",
      })
    ).rejects.toMatchObject({ code: "data_conflict" });
    const saved = await adapter.write?.(ctx, {
      baseVersion: "v1",
      content: "c,d",
      path: "offer.csv",
    });
    expect(saved?.members[0]?.content).toBe("c,d");
    expect(
      new TextDecoder().decode(
        objects.get(`${COMMONS}/public/offer.csv`)?.bytes
      )
    ).toBe("c,d");
  });

  it("is listed for people only, since agents reach it as /space", () => {
    const { adapter } = publicFolder({});
    expect(adapter.peopleOnly).toBe(true);
  });
});
