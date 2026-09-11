/**
 * `/data` inside a Code Mode sandbox (PLAN-space-data.md D6).
 *
 * A sandbox sees bind-mounted directories, not HTTP adapters, so the space's
 * Data tree has to become bytes for a program to `open()` it. This stages it as
 * a **read-through cache** at the run's edges: materialise on `syncIn`, flush
 * changed files on `syncOut`.
 *
 * The cache is disposable and lives in the sandbox's own staging directory, NOT
 * under a space prefix — §1c is explicit that for agent byte-mounts the prefix
 * IS access, so materialised records there would be a hole in the boundary the
 * whole design exists to create.
 *
 * The flush is where this stays honest: each changed file is written back
 * through the same adapter a file tool would use, so it runs the module's
 * update operation with the version read at materialisation time. A record
 * somebody else changed while the program ran comes back 409 and is REPORTED,
 * not overwritten — a sandbox is exactly where last-write-wins would do the
 * most damage, because a program can rewrite a hundred records in a second.
 */

import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { Files } from "files-sdk";

/** What was staged, so the flush can tell a real edit from an untouched file. */
export type SpaceDataStagingManifest = Map<string, string>;

export interface SpaceDataFlushResult {
  /** Files whose record changed underneath the program. */
  conflicts: Array<{ key: string; reason: string }>;
  /** Files the program changed and that were written back. */
  written: string[];
}

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Write the tree into `stagingPath`, and remember what each file looked like.
 *
 * Bounded by the adapter's own listing caps rather than a second limit here: an
 * unbounded materialisation would be a scan of the tenant's data dressed up as
 * a directory, which is the failure mode the adapter's walk already refuses.
 */
export async function materializeSpaceData(input: {
  files: Files;
  stagingPath: string;
}): Promise<SpaceDataStagingManifest> {
  const manifest: SpaceDataStagingManifest = new Map();
  const listing = await input.files.list();
  for (const item of listing.items) {
    let content: string;
    try {
      content = await (await input.files.download(item.key)).text();
    } catch {
      // A node the run cannot read is simply absent from the cache. The tree is
      // a view over stores that fail separately, and so is its staging.
      continue;
    }
    const target = join(input.stagingPath, ...item.key.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    manifest.set(item.key, digest(content));
  }
  return manifest;
}

async function walkFiles(root: string, current = root): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(root, path)));
      continue;
    }
    found.push(path);
  }
  return found;
}

/**
 * Write back what the program changed, and report what it could not.
 *
 * Files the program did not touch are skipped by CONTENT, not by mtime: a
 * program that rewrites a file with identical bytes should not raise an
 * approval card, and a build step that touches every file it reads is normal.
 *
 * A new file the program created is skipped too, with a conflict noted. Records
 * are created by their module's create operation with its own schema and gate;
 * inventing one from a filename would be the write path guessing, which is the
 * one thing this design never does.
 */
export async function flushSpaceData(input: {
  files: Files;
  manifest: SpaceDataStagingManifest;
  stagingPath: string;
}): Promise<SpaceDataFlushResult> {
  const conflicts: SpaceDataFlushResult["conflicts"] = [];
  const written: string[] = [];
  for (const path of await walkFiles(input.stagingPath)) {
    const key = relative(input.stagingPath, path).split(sep).join("/");
    const before = input.manifest.get(key);
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      continue;
    }
    if (before === undefined) {
      conflicts.push({
        key,
        reason:
          "New files under /data are not records — create one with the module's own action.",
      });
      continue;
    }
    if (digest(content) === before) {
      continue;
    }
    try {
      // The adapter re-reads the record's version immediately before writing,
      // and the SERVER compares — so a record changed while the program ran is
      // refused here rather than silently overwritten.
      await input.files.upload(key, content);
      written.push(key);
    } catch (error) {
      conflicts.push({
        key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { conflicts, written };
}

/**
 * Whether a staging directory has anything in it.
 *
 * Used to decide whether the flush is worth attempting at all — a run that
 * never opened `/data` should not pay for a walk of it at teardown.
 */
export async function spaceDataStagingExists(
  stagingPath: string
): Promise<boolean> {
  try {
    return (await stat(stagingPath)).isDirectory();
  } catch {
    return false;
  }
}
