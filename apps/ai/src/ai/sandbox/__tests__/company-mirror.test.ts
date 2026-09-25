import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listCompanyApps } from "../../workspace/company-apps.js";
import type { EngentyCoreFileStorageClient } from "../../workspace/core-file-storage-client.js";
import {
  refreshCompanyMirror,
  resolveCompanyMirrorPath,
} from "../company-mirror.js";

// `/company` in a computer is a copy. Ways it can fail: a file its Space
// unpublished stays readable; a Space that stopped publishing keeps its
// folder; one Space's file lands in another's folder; a key that climbs out
// of its prefix writes outside the copy; a changed file keeps its old bytes.

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const DRIVE = `tenants/${T}/ai/workspace/commons/`;
const publicOf = (space: string) =>
  `tenants/${T}/spaces/${space}/ai/workspace/commons/public/`;

function fakeStorage(initial: Record<string, string>) {
  const objects = new Map<string, { body: string; updated: number }>();
  let clock = 0;
  const put = (key: string, body: string) => {
    clock += 1;
    objects.set(key, { body, updated: clock });
  };
  for (const [key, body] of Object.entries(initial)) {
    put(key, body);
  }
  const client = {
    download: vi.fn(async (key: string) => {
      const object = objects.get(key);
      return object ? new TextEncoder().encode(object.body) : null;
    }),
    list: vi.fn(async (prefix: string) =>
      [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({
          key,
          size_bytes: object.body.length,
          updated_at: String(object.updated),
        }))
    ),
  } as unknown as EngentyCoreFileStorageClient;
  return { client, objects, put };
}

describe("refreshCompanyMirror", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "engenty-company-"));
    vi.stubEnv("ENGENTY_SPACES_DIR", root);
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  const read = (relative: string) =>
    readFileSync(path.join(resolveCompanyMirrorPath(T), relative), "utf8");
  const has = (relative: string) =>
    existsSync(path.join(resolveCompanyMirrorPath(T), relative));

  it("copies the drive and each Space's public folder under its key", async () => {
    const { client } = fakeStorage({
      [`${DRIVE}brand/logo.svg`]: "<svg/>",
      [`${publicOf(A)}price-list.csv`]: "a",
      [`${publicOf(B)}roadmap.md`]: "b",
      // Not in a public folder: never copied.
      [`tenants/${T}/spaces/${A}/ai/workspace/commons/draft.md`]: "secret",
    });
    await refreshCompanyMirror({
      client,
      spaces: [
        { id: A, key: "marketing" },
        { id: B, key: "sales" },
      ],
      tenantId: T,
    });
    expect(read("files/brand/logo.svg")).toBe("<svg/>");
    expect(read("spaces/marketing/price-list.csv")).toBe("a");
    expect(read("spaces/sales/roadmap.md")).toBe("b");
    expect(has("spaces/marketing/roadmap.md")).toBe(false);
    expect(has("spaces/marketing/draft.md")).toBe(false);
  });

  it("removes what was unpublished and the folders of Spaces that stopped", async () => {
    const storage = fakeStorage({
      [`${publicOf(A)}keep.md`]: "keep",
      [`${publicOf(A)}old/gone.md`]: "gone",
      [`${publicOf(B)}roadmap.md`]: "b",
    });
    const spaces = [
      { id: A, key: "marketing" },
      { id: B, key: "sales" },
    ];
    await refreshCompanyMirror({ client: storage.client, spaces, tenantId: T });
    storage.objects.delete(`${publicOf(A)}old/gone.md`);
    await refreshCompanyMirror({
      client: storage.client,
      spaces: [spaces[0] as { id: string; key: string }],
      tenantId: T,
    });
    expect(read("spaces/marketing/keep.md")).toBe("keep");
    expect(has("spaces/marketing/old")).toBe(false);
    expect(has("spaces/sales")).toBe(false);
  });

  it("picks up a changed file", async () => {
    const storage = fakeStorage({ [`${DRIVE}policy.md`]: "v1" });
    await refreshCompanyMirror({
      client: storage.client,
      spaces: [],
      tenantId: T,
    });
    storage.put(`${DRIVE}policy.md`, "v2");
    await refreshCompanyMirror({
      client: storage.client,
      spaces: [],
      tenantId: T,
    });
    expect(read("files/policy.md")).toBe("v2");
  });

  it("never writes outside the copy for a key that climbs out", async () => {
    const { client } = fakeStorage({ [`${DRIVE}../../escape.txt`]: "x" });
    await refreshCompanyMirror({ client, spaces: [], tenantId: T });
    expect(
      existsSync(path.join(resolveCompanyMirrorPath(T), "..", "escape.txt"))
    ).toBe(false);
    expect(existsSync(path.join(root, "tenants", T, "escape.txt"))).toBe(false);
  });

  it("copies an App's source without its history, installs or links, and drops a removed App", async () => {
    // The App lives in app-host's tree on the host, not in storage.
    const src = path.join(
      root,
      "tenants",
      T,
      "spaces",
      A,
      "apps",
      "crm",
      "src"
    );
    mkdirSync(path.join(src, ".git"), { recursive: true });
    mkdirSync(path.join(src, "node_modules", "left-pad"), { recursive: true });
    writeFileSync(path.join(src, "index.ts"), "export {}");
    writeFileSync(path.join(src, ".git", "HEAD"), "ref");
    writeFileSync(path.join(src, "node_modules", "left-pad", "i.js"), "x");
    symlinkSync("/etc/hosts", path.join(src, "hosts"));
    const { client } = fakeStorage({});
    const spaces = [{ id: A, key: "marketing" }];

    const apps = listCompanyApps(T, spaces);
    expect(apps.map((app) => app.slug)).toEqual(["crm"]);
    // An App of a Space that does not publish is not listed.
    expect(listCompanyApps(T, [])).toEqual([]);

    await refreshCompanyMirror({ apps, client, spaces, tenantId: T });
    expect(read("apps/crm/index.ts")).toBe("export {}");
    expect(has("apps/crm/.git")).toBe(false);
    expect(has("apps/crm/node_modules")).toBe(false);
    expect(has("apps/crm/hosts")).toBe(false);

    await refreshCompanyMirror({ apps: [], client, spaces, tenantId: T });
    expect(has("apps/crm")).toBe(false);
  });
});
