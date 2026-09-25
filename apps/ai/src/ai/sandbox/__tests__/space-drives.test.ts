import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const destroyed: string[] = [];
vi.mock("../destroy-engenty-sandbox.js", () => ({
  destroyEngentySandboxById: async (id: string) => {
    destroyed.push(id);
  },
}));
vi.mock("../engenty-sandbox-docker.js", () => ({
  listEngentyDockerSandboxBinds: async () => new Set<string>(),
}));

const { getSpaceDriveUsage, sweepSpaceDrives } = await import(
  "../space-drives.js"
);

// A Space's folder holds its logins and its Apps' repositories. Ways the
// sweep can fail: it deletes the folder of a Space that still exists (a
// soft-deleted one is restorable), or of every Space when the lookup failed or
// saw nothing; it touches what is not a Space folder (per-run staging under
// tenants/<t>/ai/); it leaves a purged Space's folder and containers behind;
// over quota it deletes something other than the package caches.

const T = "11111111-1111-4111-8111-111111111111";
const KEPT = "22222222-2222-4222-8222-222222222222";
const PURGED = "33333333-3333-4333-8333-333333333333";

describe("sweepSpaceDrives", () => {
  let root: string;
  const space = (id: string) => path.join(root, "tenants", T, "spaces", id);

  function write(file: string, bytes: number) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(bytes, 1));
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "engenty-drives-"));
    destroyed.length = 0;
    write(path.join(space(KEPT), "home", ".acme", "credentials.json"), 10);
    write(path.join(space(PURGED), "apps", "a", "src", "index.ts"), 10);
    write(path.join(root, "tenants", T, "ai", "sandboxes", "run-x", "f"), 10);
    mkdirSync(path.join(root, "tenants", T, "spaces", "not-a-space"), {
      recursive: true,
    });
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("removes a purged Space's folder and containers, and nothing else", async () => {
    const result = await sweepSpaceDrives({
      root,
      spacesWithRow: async () => new Set([KEPT]),
    });

    expect(result).toEqual({ measured: 1, removed: 1 });
    expect(existsSync(space(PURGED))).toBe(false);
    expect(destroyed).toEqual([
      `engenty-space-${T}-${PURGED}`,
      `engenty-browser-${T}-${PURGED}`,
    ]);
    expect(existsSync(path.join(space(KEPT), "home", ".acme"))).toBe(true);
    expect(existsSync(path.join(root, "tenants", T, "ai", "sandboxes"))).toBe(
      true
    );
    expect(existsSync(space("not-a-space"))).toBe(true);
  });

  it("removes nothing when the lookup fails or sees no Space at all", async () => {
    for (const spacesWithRow of [
      async () => {
        throw new Error("db down");
      },
      async () => new Set<string>(),
    ]) {
      expect(await sweepSpaceDrives({ root, spacesWithRow })).toEqual({
        measured: 0,
        removed: 0,
      });
    }
    expect(existsSync(space(PURGED))).toBe(true);
    expect(destroyed).toEqual([]);
  });

  it("over quota, clears the Space's package caches and keeps the rest", async () => {
    vi.stubEnv("ENGENTY_SPACE_DRIVE_MAX_BYTES", String(512 * 1024));
    write(path.join(space(KEPT), "cache", "npm", "big.tgz"), 2 * 1024 * 1024);

    await sweepSpaceDrives({
      root,
      spacesWithRow: async () => new Set([KEPT, PURGED]),
    });

    expect(existsSync(path.join(space(KEPT), "cache"))).toBe(false);
    expect(existsSync(path.join(space(KEPT), "home", ".acme"))).toBe(true);
    expect(existsSync(space(PURGED))).toBe(true);
    const usage = getSpaceDriveUsage(T, KEPT);
    expect(usage?.maxBytes).toBe(512 * 1024);
    expect(usage?.bytes).toBeLessThan(512 * 1024);
  });
});
