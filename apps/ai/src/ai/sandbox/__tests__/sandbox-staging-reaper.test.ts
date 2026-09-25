import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEngentyDockerSandboxes = vi.fn();
const listEngentyDockerSandboxBinds = vi.fn();

vi.mock("../engenty-sandbox-docker.js", () => ({
  listEngentyDockerSandboxBinds: () => listEngentyDockerSandboxBinds(),
  listEngentyDockerSandboxes: (
    input?: Parameters<typeof listEngentyDockerSandboxes>[0]
  ) => listEngentyDockerSandboxes(input),
}));

const { reapSandboxStagingDirs } = await import("../sandbox-staging-reaper.js");

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

let root: string;

function scopeDir(
  scopeKey: string,
  input?: { spaceId?: string; tenantId?: string }
): string {
  const tenantDir = path.join(root, "tenants", input?.tenantId ?? "tenant-1");
  const base = input?.spaceId
    ? path.join(tenantDir, "spaces", input.spaceId)
    : tenantDir;
  return path.join(base, "ai", "sandboxes", scopeKey);
}

async function stageCache(
  tool: string,
  input?: { ageMs?: number; sizeBytes?: number; spaceId?: string }
): Promise<string> {
  const tenantDir = path.join(root, "tenants", "tenant-1");
  const base = input?.spaceId
    ? path.join(tenantDir, "spaces", input.spaceId)
    : tenantDir;
  const dir = path.join(base, "ai", "cache", tool);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "wheel.bin"),
    Buffer.alloc(input?.sizeBytes ?? 16)
  );
  const ageMs = input?.ageMs ?? 0;
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    await utimes(dir, when, when);
  }
  return dir;
}

async function stageScope(
  scopeKey: string,
  input?: {
    ageMs?: number;
    sizeBytes?: number;
    spaceId?: string;
    tenantId?: string;
  }
): Promise<string> {
  const dir = scopeDir(scopeKey, input);
  await mkdir(path.join(dir, "workspace"), { recursive: true });
  await writeFile(
    path.join(dir, "workspace", "out.txt"),
    Buffer.alloc(input?.sizeBytes ?? 5)
  );
  const ageMs = input?.ageMs ?? 0;
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    await utimes(path.join(dir, "workspace"), when, when);
    await utimes(dir, when, when);
  }
  return dir;
}

describe("reapSandboxStagingDirs", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "engenty-reaper-"));
    vi.stubEnv("ENGENTY_SPACES_DIR", root);
    // The suite defaults to `local` (vitest.config.ts); the reaper only ever
    // runs against a `remote`-backed root, so state that explicitly here.
    vi.stubEnv("ENGENTY_WORKSPACE_FS", "remote");
    listEngentyDockerSandboxes.mockResolvedValue([]);
    listEngentyDockerSandboxBinds.mockResolvedValue(new Set<string>());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    listEngentyDockerSandboxes.mockReset();
    listEngentyDockerSandboxBinds.mockReset();
    rmSync(root, { force: true, recursive: true });
  });

  it("deletes a scope dir past the TTL with no running container", async () => {
    const dir = await stageScope("run-abc", { ageMs: TWO_DAYS_MS });

    await expect(reapSandboxStagingDirs()).resolves.toBe(1);
    expect(existsSync(dir)).toBe(false);
  });

  it("keeps a scope dir whose container is still running", async () => {
    const dir = await stageScope("session-thread-1", { ageMs: TWO_DAYS_MS });
    listEngentyDockerSandboxes.mockResolvedValue([
      {
        container_id: "c1",
        container_name: "engenty-session-thread-1",
        created_at_ms: Date.now(),
        sandbox_id: "engenty-session-thread-1",
        state: "running",
      },
    ]);

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(dir)).toBe(true);
  });

  it("keeps a scope dir that is still inside the TTL", async () => {
    const dir = await stageScope("run-fresh");

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(dir)).toBe(true);
  });

  it("no-ops entirely when the workspace fs is the durable local store", async () => {
    // With ENGENTY_WORKSPACE_FS=local there is no object storage behind this
    // root — reaping would delete the only copy.
    vi.stubEnv("ENGENTY_WORKSPACE_FS", "local");
    const dir = await stageScope("run-abc", { ageMs: TWO_DAYS_MS });

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(dir)).toBe(true);
  });

  it("reaps a space-rooted scope dir, not only the tenant-rooted one", async () => {
    const spaced = await stageScope("run-spaced", {
      ageMs: TWO_DAYS_MS,
      spaceId: "space-1",
    });

    await expect(reapSandboxStagingDirs()).resolves.toBe(1);
    expect(existsSync(spaced)).toBe(false);
  });

  it("keeps a dir that is bind-mounted right now even past the TTL", async () => {
    // The scope key says nothing is running, but the bind list says otherwise —
    // the bind list wins, because it is the one that cannot be stale.
    const dir = await stageScope("run-bound", { ageMs: TWO_DAYS_MS });
    listEngentyDockerSandboxBinds.mockResolvedValue(new Set([dir]));

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(dir)).toBe(true);
  });

  it("evicts the oldest in-TTL scope dirs when the byte budget is blown", async () => {
    vi.stubEnv("ENGENTY_SANDBOX_STAGING_MAX_BYTES", "3000");
    const oldest = await stageScope("run-oldest", {
      ageMs: 60_000,
      sizeBytes: 2048,
    });
    const newest = await stageScope("run-newest", { sizeBytes: 2048 });

    await expect(reapSandboxStagingDirs()).resolves.toBe(1);
    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(newest)).toBe(true);
  });

  it("ages out a package cache but keeps one inside its longer TTL", async () => {
    const stale = await stageCache("uv", { ageMs: 40 * 24 * 60 * 60 * 1000 });
    // Well past the staging TTL, nowhere near the cache TTL: a cache is only
    // worth anything if it outlives the run that filled it.
    const warm = await stageCache("npm", { ageMs: TWO_DAYS_MS });

    await expect(reapSandboxStagingDirs()).resolves.toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(warm)).toBe(true);
  });

  it("keeps a bound package cache regardless of age", async () => {
    const bound = await stageCache("uv", { ageMs: 40 * 24 * 60 * 60 * 1000 });
    listEngentyDockerSandboxBinds.mockResolvedValue(new Set([bound]));

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(bound)).toBe(true);
  });

  it("leaves the shared ai/workspace staging tree alone", async () => {
    const commons = path.join(
      root,
      "tenants",
      "tenant-1",
      "ai",
      "workspace",
      "commons"
    );
    await mkdir(commons, { recursive: true });
    const when = new Date(Date.now() - TWO_DAYS_MS);
    await utimes(commons, when, when);

    await expect(reapSandboxStagingDirs()).resolves.toBe(0);
    expect(existsSync(commons)).toBe(true);
  });
});
