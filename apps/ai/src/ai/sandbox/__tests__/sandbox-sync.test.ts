import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngentyCoreFileStorageClient } from "../../workspace/core-file-storage-client.js";
import {
  pullSandboxWorkspaceFromStorage,
  pushSandboxWorkspaceToStorage,
} from "../sandbox-sync.js";

// A deletion in the staged folder must reach storage, or it lasts only until
// the next pull — and a file taken out of `/space/public` stays published.
// Ways it can fail: the deleted file comes back; a file someone else added
// to storage after the pull is deleted because this run never saw it.

const T = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const PREFIX = `tenants/${T}/spaces/${S}/ai/workspace/commons/`;

function fakeStorage(initial: string[]) {
  const objects = new Map(initial.map((key) => [key, "x"]));
  const client = {
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    download: vi.fn(async (key: string) =>
      objects.has(key) ? new TextEncoder().encode(objects.get(key)) : null
    ),
    list: vi.fn(async (prefix: string) =>
      [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key }))
    ),
    upload: vi.fn(async (key: string) => {
      objects.set(key, "x");
    }),
  } as unknown as EngentyCoreFileStorageClient;
  return { client, objects };
}

describe("sandbox sync", () => {
  let staging: string;

  beforeEach(() => {
    staging = mkdtempSync(path.join(tmpdir(), "engenty-sync-"));
  });

  afterEach(() => {
    rmSync(staging, { force: true, recursive: true });
  });

  const layout = () => ({
    fileStorageRelativePath: "ai/workspace/commons/",
    spaceId: S,
    stagingPath: staging,
  });

  it("deletes in storage what the run deleted, and only that", async () => {
    const { client, objects } = fakeStorage([
      `${PREFIX}public/price-list.csv`,
      `${PREFIX}notes.md`,
    ]);
    const pulled = await pullSandboxWorkspaceFromStorage({
      client,
      layout: layout(),
      tenantId: T,
    });
    unlinkSync(path.join(staging, "public", "price-list.csv"));
    // Written by someone else after this run pulled.
    objects.set(`${PREFIX}public/new-from-ui.md`, "x");

    await pushSandboxWorkspaceToStorage({
      client,
      layout: layout(),
      pulled,
      tenantId: T,
    });

    expect(objects.has(`${PREFIX}public/price-list.csv`)).toBe(false);
    expect(objects.has(`${PREFIX}notes.md`)).toBe(true);
    expect(objects.has(`${PREFIX}public/new-from-ui.md`)).toBe(true);
  });
});
