import { existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AppStore } from "../app-store.js";

const PLACEMENT = {
  slug: "travel-expenses",
  spaceId: "00000000-0000-4000-8000-000000000002",
  tenantId: "00000000-0000-4000-8000-000000000001",
};

describe("AppStore", () => {
  const spacesDir = mkdtempSync(path.join(tmpdir(), "app-store-"));
  afterAll(() => rmSync(spacesDir, { force: true, recursive: true }));
  const store = new AppStore({ maxSourceBytes: 100_000, spacesDir });

  it("places an App under its space and links it by app id", async () => {
    const dir = await store.place("t-1-a-1", PLACEMENT);
    expect(dir).toBe(
      path.join(
        spacesDir,
        "tenants",
        PLACEMENT.tenantId,
        "spaces",
        PLACEMENT.spaceId,
        "apps",
        PLACEMENT.slug
      )
    );
    expect(existsSync(path.join(dir, "src", ".git"))).toBe(true);
    expect(existsSync(path.join(dir, "data"))).toBe(true);
    const link = path.join(spacesDir, "apps", "t-1-a-1");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(store.dataDir("t-1-a-1")).toBe(path.join(link, "data"));
  });

  it("places an App outside any space at the tenant level", async () => {
    const dir = await store.place("t-1-a-2", { ...PLACEMENT, spaceId: null });
    expect(dir).toBe(
      path.join(
        spacesDir,
        "tenants",
        PLACEMENT.tenantId,
        "apps",
        PLACEMENT.slug
      )
    );
  });

  it("commits writes and reads the tree back at that commit", async () => {
    const first = await store.writeSource("t-1-a-3", PLACEMENT, {
      files: {
        "engenty.json": '{"name":"Travel"}',
        "src/main.tsx": "export {}",
      },
      message: "first",
    });
    expect(first.changed).toBe(true);
    expect(first.sha).toMatch(/^[0-9a-f]{40}$/);

    // A clean tree commits nothing and answers with the same HEAD.
    const again = await store.writeSource("t-1-a-3", PLACEMENT, {
      message: "nothing",
    });
    expect(again).toEqual({ changed: false, sha: first.sha });

    const second = await store.writeSource("t-1-a-3", PLACEMENT, {
      delete: ["src/main.tsx"],
      files: { "server.js": "export default {}" },
      message: "second",
    });
    expect(second.sha).not.toBe(first.sha);

    const atFirst = await store.readSource("t-1-a-3", first.sha);
    expect(Object.keys(atFirst.files).sort()).toEqual([
      "engenty.json",
      "src/main.tsx",
    ]);
    const atHead = await store.readSource("t-1-a-3", "HEAD");
    expect(atHead.sha).toBe(second.sha);
    expect(Object.keys(atHead.files).sort()).toEqual([
      "engenty.json",
      "server.js",
    ]);
    expect(atHead.files["server.js"]).toBe("export default {}");
  });

  it("refuses paths that leave the tree or touch .git", async () => {
    for (const filePath of ["../x", "a/../../x", ".git/config", "/abs"]) {
      await expect(
        store.writeSource("t-1-a-4", PLACEMENT, {
          files: { [filePath]: "x" },
          message: "bad",
        })
      ).rejects.toThrow(/invalid source path/);
    }
    await expect(store.readSource("t-1-a-3", "--output=x")).rejects.toThrow(
      /invalid git ref/
    );
  });

  it("refuses a placement that could leave the spaces tree", () => {
    expect(() => store.appDir({ ...PLACEMENT, tenantId: "../etc" })).toThrow(
      /invalid tenant id/
    );
    expect(() => store.appDir({ ...PLACEMENT, slug: "Bad Slug" })).toThrow(
      /invalid app slug/
    );
  });

  it("caps what a release may read", async () => {
    const small = new AppStore({ maxSourceBytes: 10, spacesDir });
    await small.writeSource("t-1-a-5", PLACEMENT, {
      files: { "index.html": "x".repeat(50) },
      message: "big",
    });
    await expect(small.readSource("t-1-a-5", "HEAD")).rejects.toThrow(
      /byte limit/
    );
  });
});
