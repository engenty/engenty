/**
 * Where a file space's bytes land (PLAN-spaces.md Phase 4).
 *
 * Exercised through `createNativeFileSource` rather than the private key
 * builder, because the shipping path is the one that has to be right: the key
 * is minted during `beginUpload` and written back onto the row.
 */
import { describe, expect, it } from "vitest";
import type {
  FileEntryRow,
  NativeBlobStore,
  NativeEntryStore,
  NativeFolderStore,
} from "../file-source-types.js";
import { createNativeFileSource } from "./native-file-source.js";

const TENANT = "019fe855-3dba-759c-88a9-4b142182b8df";
const SPACE = "019fe871-f780-78ee-9232-20b4c84665de";
const OTHER_SPACE = "019fe8ec-c14e-753a-be70-320b8bb27cf8";

function stubStores() {
  const rows = new Map<string, FileEntryRow>();
  const entries: NativeEntryStore = {
    createPending: (_ctx, input) => {
      const row: FileEntryRow = {
        createdAt: "2026-08-10T00:00:00Z",
        filename: input.filename,
        folderId: input.folderId,
        id: "entry-1",
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: "pending",
        storageKey: input.storageKey,
        updatedAt: "2026-08-10T00:00:00Z",
      };
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    delete: () => Promise.resolve(),
    get: (_ctx, id) => Promise.resolve(rows.get(id) ?? null),
    list: () => Promise.resolve([...rows.values()]),
    update: (_ctx, id, patch) => {
      const row = rows.get(id);
      if (!row) {
        return Promise.resolve(null);
      }
      const next = { ...row, ...patch };
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
    upload: () => Promise.resolve(),
  };
  return { blobs, entries, folders };
}

async function keyFor(owner: { id: string; type: string }, spaceId?: string) {
  const source = createNativeFileSource(stubStores());
  const ticket = await source.beginUpload(
    { owner, tenantId: TENANT, ...(spaceId ? { spaceId } : {}) },
    {
      filename: "brief.pdf",
      folderId: null,
      mimeType: "application/pdf",
      sizeBytes: 10,
    }
  );
  return ticket.storageKey;
}

describe("native file-source storage keys", () => {
  it("puts a SPACE file space's bytes under the space's own prefix", async () => {
    // §1b: one prefix per space covers everything — drive, agent scratch and
    // artifact mirrors alike — which is what makes space export, space delete
    // and per-space mirroring single operations.
    expect(await keyFor({ id: SPACE, type: "space" })).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/files/entry-1`
    );
  });

  it("puts a PROJECT file space's bytes under ITS space too", async () => {
    // Phase 6 re-root. The tail is the pre-space shape
    // (`files/spaces/<type>/<id>/<entry>`) moved below the space root, so both
    // layouts read as the same thing in a bucket listing.
    expect(await keyFor({ id: "project-1", type: "project" }, SPACE)).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/files/project/project-1/entry-1`
    );
  });

  it("REFUSES to key a non-space owner without a space", async () => {
    // No fallback on purpose. A default would silently restore the
    // tenant-level root Phase 6 closed, and the bytes would be wrong in a way
    // nothing surfaces until someone exports a space and finds them missing.
    await expect(keyFor({ id: "project-1", type: "project" })).rejects.toThrow(
      /file_space_missing_space_id/
    );
  });

  it("puts two spaces' project files on disjoint prefixes", async () => {
    const a = await keyFor({ id: "project-1", type: "project" }, SPACE);
    const b = await keyFor({ id: "project-1", type: "project" }, OTHER_SPACE);
    expect(a).not.toBe(b);
    expect(a.startsWith(`tenants/${TENANT}/spaces/${SPACE}/`)).toBe(true);
    expect(b.startsWith(`tenants/${TENANT}/spaces/${OTHER_SPACE}/`)).toBe(true);
  });

  it("keeps every key inside the tenant root, below a space", async () => {
    for (const key of [
      await keyFor({ id: SPACE, type: "space" }),
      await keyFor({ id: "project-1", type: "project" }, SPACE),
    ]) {
      expect(key).toMatch(new RegExp(`^tenants/${TENANT}/spaces/`));
    }
  });
});
