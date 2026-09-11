/**
 * The `/data` read-through cache (PLAN-space-data.md D6).
 *
 * The property under test: a sandbox may hold bytes, but the WRITE path is
 * still the operation pipeline — so what the flush does is call the adapter,
 * and what it refuses is everything that would be a guess.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Files } from "files-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushSpaceData,
  materializeSpaceData,
  spaceDataStagingExists,
} from "../space-data-staging.js";

const CONTACT_KEY = "Contacts/People/anna__1.contact.md";
const CONTACT_BODY = "---\nid: 1\n---\n\nNotes.\n";

function filesStub(input: {
  contents?: Record<string, string>;
  onUpload?: (key: string, body: unknown) => void;
}): Files {
  const contents = input.contents ?? { [CONTACT_KEY]: CONTACT_BODY };
  return {
    download: (key: string) =>
      Promise.resolve({
        text: () =>
          key in contents
            ? Promise.resolve(contents[key] as string)
            : Promise.reject(new Error("missing")),
      }),
    list: () =>
      Promise.resolve({
        items: Object.keys(contents).map((key) => ({ key })),
      }),
    upload: vi.fn((key: string, body: unknown) => {
      input.onUpload?.(key, body);
      return Promise.resolve({ key });
    }),
  } as unknown as Files;
}

let stagingPath: string;

beforeEach(async () => {
  stagingPath = await mkdtemp(join(tmpdir(), "engenty-space-data-"));
});

afterEach(async () => {
  await rm(stagingPath, { force: true, recursive: true });
});

describe("materialize", () => {
  it("writes the tree to disk and remembers what it wrote", async () => {
    const manifest = await materializeSpaceData({
      files: filesStub({}),
      stagingPath,
    });
    expect(
      await readFile(join(stagingPath, ...CONTACT_KEY.split("/")), "utf8")
    ).toBe(CONTACT_BODY);
    expect(manifest.has(CONTACT_KEY)).toBe(true);
  });

  it("skips a node the run cannot read rather than failing the whole stage", async () => {
    const files = filesStub({ contents: { [CONTACT_KEY]: CONTACT_BODY } });
    // A download that rejects for one key must not blank the cache.
    const failing = {
      ...files,
      download: (key: string) =>
        key === CONTACT_KEY
          ? Promise.reject(new Error("forbidden"))
          : Promise.resolve({ text: () => Promise.resolve("x") }),
    } as unknown as Files;
    const manifest = await materializeSpaceData({
      files: failing,
      stagingPath,
    });
    expect(manifest.size).toBe(0);
  });
});

describe("flush", () => {
  it("writes back only what the program actually changed", async () => {
    const uploads: string[] = [];
    const files = filesStub({ onUpload: (key) => uploads.push(key) });
    const manifest = await materializeSpaceData({ files, stagingPath });

    const result = await flushSpaceData({ files, manifest, stagingPath });
    // Nothing touched: nothing written, and crucially no approval card raised
    // for a file the program only read.
    expect(result.written).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("skips a rewrite with identical bytes — comparison is by CONTENT, not mtime", async () => {
    const uploads: string[] = [];
    const files = filesStub({ onUpload: (key) => uploads.push(key) });
    const manifest = await materializeSpaceData({ files, stagingPath });
    const path = join(stagingPath, ...CONTACT_KEY.split("/"));
    await writeFile(path, CONTACT_BODY, "utf8");

    expect(
      (await flushSpaceData({ files, manifest, stagingPath })).written
    ).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("writes a genuinely edited file back through the adapter", async () => {
    const uploads: Array<{ body: unknown; key: string }> = [];
    const files = filesStub({
      onUpload: (key, body) => uploads.push({ body, key }),
    });
    const manifest = await materializeSpaceData({ files, stagingPath });
    await writeFile(
      join(stagingPath, ...CONTACT_KEY.split("/")),
      "---\nid: 1\n---\n\nEdited by the program.\n",
      "utf8"
    );

    const result = await flushSpaceData({ files, manifest, stagingPath });
    expect(result.written).toEqual([CONTACT_KEY]);
    // Through the adapter — which re-reads the version and lets the SERVER
    // compare — never straight into storage.
    expect(uploads).toHaveLength(1);
    expect(String(uploads[0]?.body)).toContain("Edited by the program.");
  });

  it("reports a conflict instead of dropping the write silently", async () => {
    const files = {
      ...filesStub({}),
      upload: () =>
        Promise.reject(new Error("This has changed since you opened it.")),
    } as unknown as Files;
    const manifest = await materializeSpaceData({
      files: filesStub({}),
      stagingPath,
    });
    await writeFile(
      join(stagingPath, ...CONTACT_KEY.split("/")),
      "changed",
      "utf8"
    );

    const result = await flushSpaceData({ files, manifest, stagingPath });
    expect(result.written).toEqual([]);
    expect(result.conflicts[0]?.reason).toMatch(/changed since/);
  });

  it("refuses to invent a record from a file the program created", async () => {
    const uploads: string[] = [];
    const files = filesStub({ onUpload: (key) => uploads.push(key) });
    const manifest = await materializeSpaceData({ files, stagingPath });
    await writeFile(join(stagingPath, "invented.md"), "hello", "utf8");

    const result = await flushSpaceData({ files, manifest, stagingPath });
    // Records are created by their module's create operation, with its schema
    // and its gate. Guessing one from a filename is the write path guessing.
    expect(uploads).toEqual([]);
    expect(result.conflicts[0]?.key).toBe("invented.md");
    expect(result.conflicts[0]?.reason).toMatch(/module's own action/);
  });
});

describe("staging existence", () => {
  it("answers false for a directory that was never created", async () => {
    expect(await spaceDataStagingExists(join(stagingPath, "nope"))).toBe(false);
    expect(await spaceDataStagingExists(stagingPath)).toBe(true);
  });
});
