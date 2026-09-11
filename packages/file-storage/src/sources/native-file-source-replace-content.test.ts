/**
 * Saving an edit — the one operation that can leave the row disagreeing with
 * the object it describes.
 *
 * Exercised through `createNativeFileSource` with stub ports, so what is tested
 * is the ordering and the refusals, not Supabase.
 */
import { describe, expect, it } from "vitest";
import type {
  FileEntryRow,
  NativeBlobStore,
  NativeEntryStore,
  NativeFolderStore,
} from "../file-source-types.js";
import {
  createNativeFileSource,
  FileSourceConflictError,
  FileSourceNotFoundError,
} from "./native-file-source.js";

const CTX = {
  owner: { id: "019fe871-f780-78ee-9232-20b4c84665de", type: "space" },
  tenantId: "019fe855-3dba-759c-88a9-4b142182b8df",
};

const OPENED_AT = "2026-08-10T00:00:00Z";

interface Harness {
  blobs: NativeBlobStore;
  entries: NativeEntryStore;
  folders: NativeFolderStore;
  rows: Map<string, FileEntryRow>;
  uploads: Array<{ contentType?: string; data: Uint8Array; key: string }>;
}

function harness(
  overrides: {
    entry?: Partial<FileEntryRow>;
    failUpdate?: boolean;
    failUpload?: boolean;
  } = {}
): Harness {
  const rows = new Map<string, FileEntryRow>();
  rows.set("file-1", {
    createdAt: OPENED_AT,
    filename: "notes.md",
    folderId: null,
    id: "file-1",
    mimeType: "text/markdown",
    sizeBytes: 11,
    status: "active",
    storageKey: "tenants/t/spaces/s/files/file-1",
    updatedAt: OPENED_AT,
    ...overrides.entry,
  });
  const uploads: Harness["uploads"] = [];

  const entries: NativeEntryStore = {
    createPending: () => Promise.reject(new Error("unused")),
    delete: () => Promise.resolve(),
    get: (_ctx, id) => Promise.resolve(rows.get(id) ?? null),
    list: () => Promise.resolve([...rows.values()]),
    update: (_ctx, id, patch) => {
      if (overrides.failUpdate) {
        return Promise.resolve(null);
      }
      const row = rows.get(id);
      if (!row) {
        return Promise.resolve(null);
      }
      // The real store stamps `updated_at` on every update — the version token
      // only works because it moves.
      const next = { ...row, ...patch, updatedAt: "2026-08-11T09:00:00Z" };
      rows.set(id, next);
      return Promise.resolve(next);
    },
  };
  const folders: NativeFolderStore = {
    create: () => Promise.reject(new Error("unused")),
    delete: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    list: () => Promise.resolve([]),
    listDescendantStorageKeys: () => Promise.resolve([]),
    update: () => Promise.resolve(null),
  };
  const blobs: NativeBlobStore = {
    delete: () => Promise.resolve(),
    getUrl: () => Promise.resolve("https://example.test/blob"),
    upload: (key, data, options) => {
      if (overrides.failUpload) {
        return Promise.reject(new Error("storage down"));
      }
      uploads.push({ data, key, ...(options?.contentType ? options : {}) });
      return Promise.resolve();
    },
  };
  return { blobs, entries, folders, rows, uploads };
}

function sourceFor(h: Harness) {
  return createNativeFileSource({
    blobs: h.blobs,
    entries: h.entries,
    folders: h.folders,
  });
}

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("replaceContent", () => {
  it("writes to the entry's OWN key and updates sizeBytes to match", async () => {
    const h = harness();
    const file = await sourceFor(h).replaceContent(CTX, "file-1", {
      data: bytesOf("# Küste\n\nlonger than before"),
      expectedUpdatedAt: OPENED_AT,
    });

    expect(h.uploads).toHaveLength(1);
    // Same key: rename and move stay pure metadata, so an edit must not mint a
    // new one.
    expect(h.uploads[0]?.key).toBe("tenants/t/spaces/s/files/file-1");
    expect(h.uploads[0]?.contentType).toBe("text/markdown");
    // The whole reason this route exists rather than a client-side signed PUT.
    expect(file.sizeBytes).toBe(
      bytesOf("# Küste\n\nlonger than before").length
    );
    expect(file.sizeBytes).not.toBe(11);
  });

  it("keeps the file's identity — id, name, folder and type all survive", async () => {
    const h = harness();
    const file = await sourceFor(h).replaceContent(CTX, "file-1", {
      data: bytesOf("x"),
      expectedUpdatedAt: OPENED_AT,
    });
    expect(file.id).toBe("file-1");
    expect(file.name).toBe("notes.md");
    expect(file.folderId).toBeNull();
    expect(file.mimeType).toBe("text/markdown");
  });

  it("moves the version token, so a second save with the old one is refused", async () => {
    const h = harness();
    const source = sourceFor(h);
    const first = await source.replaceContent(CTX, "file-1", {
      data: bytesOf("one"),
      expectedUpdatedAt: OPENED_AT,
    });
    expect(first.updatedAt).not.toBe(OPENED_AT);

    await expect(
      source.replaceContent(CTX, "file-1", {
        data: bytesOf("two"),
        expectedUpdatedAt: OPENED_AT,
      })
    ).rejects.toBeInstanceOf(FileSourceConflictError);
  });

  it("refuses a stale token WITHOUT writing anything", async () => {
    const h = harness();
    await expect(
      sourceFor(h).replaceContent(CTX, "file-1", {
        data: bytesOf("clobber"),
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
      })
    ).rejects.toBeInstanceOf(FileSourceConflictError);
    // The refusal is worthless if the bytes went out anyway.
    expect(h.uploads).toHaveLength(0);
  });

  it("hands back the current token so the client can offer to reload", async () => {
    const h = harness();
    await sourceFor(h)
      .replaceContent(CTX, "file-1", {
        data: bytesOf("x"),
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(FileSourceConflictError);
        expect((error as FileSourceConflictError).currentUpdatedAt).toBe(
          OPENED_AT
        );
      });
  });

  it("will not write to a PENDING entry — that key belongs to an upload in flight", async () => {
    const h = harness({ entry: { status: "pending" } });
    await expect(
      sourceFor(h).replaceContent(CTX, "file-1", {
        data: bytesOf("x"),
        expectedUpdatedAt: OPENED_AT,
      })
    ).rejects.toBeInstanceOf(FileSourceNotFoundError);
    expect(h.uploads).toHaveLength(0);
  });

  it("is not found for a file that does not exist", async () => {
    const h = harness();
    await expect(
      sourceFor(h).replaceContent(CTX, "nope", {
        data: bytesOf("x"),
        expectedUpdatedAt: OPENED_AT,
      })
    ).rejects.toBeInstanceOf(FileSourceNotFoundError);
  });

  it("leaves the row untouched when the blob write fails", async () => {
    const h = harness({ failUpload: true });
    await expect(
      sourceFor(h).replaceContent(CTX, "file-1", {
        data: bytesOf("x"),
        expectedUpdatedAt: OPENED_AT,
      })
    ).rejects.toThrow("storage down");
    expect(h.rows.get("file-1")?.sizeBytes).toBe(11);
    expect(h.rows.get("file-1")?.updatedAt).toBe(OPENED_AT);
  });

  it("errors — rather than reporting success — when the row update fails", async () => {
    // Bytes are written and the row is stale. The caller MUST hear about it:
    // the token did not move either, so retrying the same save repairs the row.
    const h = harness({ failUpdate: true });
    await expect(
      sourceFor(h).replaceContent(CTX, "file-1", {
        data: bytesOf("x"),
        expectedUpdatedAt: OPENED_AT,
      })
    ).rejects.toBeInstanceOf(FileSourceNotFoundError);
    expect(h.uploads).toHaveLength(1);
    expect(h.rows.get("file-1")?.updatedAt).toBe(OPENED_AT);
  });
});
