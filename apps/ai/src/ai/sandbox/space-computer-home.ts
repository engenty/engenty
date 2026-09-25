// Reading a space computer's `$HOME` and `/sandbox` from the host.
//
// Both dirs are bound read-write into a container that runs model-written
// code, so everything in them is untrusted — including their shape. Links are
// normal there (the skills CLI installs one canonical copy and links every
// agent's folder to it), so they are followed, but only while they resolve
// inside the tree: `~/.claude.json -> /etc/shadow` must read as "no such
// file", never as the host's file.

import { constants, type Dirent } from "node:fs";
import { open, readdir, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  resolveSandboxStorageLayout,
  resolveSpaceComputerHomePath,
} from "./sandbox-storage-paths.js";

export interface UntrustedTree {
  /** Sub-dirs of `rel`, links into the tree included; [] when absent. */
  listDirs(rel: string): Promise<string[]>;
  /** Regular files under `rel`, recursively, as paths relative to it. */
  listFiles(
    rel: string,
    limits: { maxDepth: number; maxFiles: number }
  ): Promise<string[]>;
  /** A regular file's bytes, or null when absent, outside, or over `maxBytes`. */
  readFile(rel: string, maxBytes: number): Promise<Buffer | null>;
  /** The real path `rel` resolves to while it stays in the tree, else null. */
  resolve(rel: string): Promise<string | null>;
}

/** Dirs that hold packages, caches or history — never an installed skill. */
export const SKIPPED_DIRS = new Set([
  ".bun",
  ".cache",
  ".cargo",
  ".git",
  ".local",
  ".npm",
  ".nvm",
  ".rustup",
  ".venv",
  "__pycache__",
  "node_modules",
  "venv",
]);

/** Path segments below the root; null for anything that climbs out of it. */
export function segmentsOf(rel: string): string[] | null {
  const normalized = path.posix.normalize(rel.replace(/^\/+/, ""));
  if (normalized === "." || normalized === "") {
    return [];
  }
  const segments = normalized.split("/");
  return segments.some((s) => s === ".." || s === "") ? null : segments;
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

/**
 * Where an open fd really points. Linux answers from the kernel, which a
 * link swapped in between the check and the open cannot fool; elsewhere
 * (a dev Mac) the path is resolved again.
 */
async function openedPath(fd: number, fallback: string): Promise<string> {
  try {
    return await readlink(`/proc/self/fd/${fd}`);
  } catch {
    return realpath(fallback);
  }
}

export function openUntrustedTree(root: string): UntrustedTree {
  let rootReal: Promise<string | null> | undefined;
  const realRoot = () => {
    rootReal ??= realpath(root).catch(() => null);
    return rootReal;
  };

  async function resolve(rel: string): Promise<string | null> {
    const segments = segmentsOf(rel);
    const base = await realRoot();
    if (!(segments && base)) {
      return null;
    }
    try {
      const real = await realpath(path.join(base, ...segments));
      return isInside(base, real) ? real : null;
    } catch {
      return null;
    }
  }

  async function entriesOf(rel: string): Promise<Dirent[]> {
    const real = await resolve(rel);
    if (!real) {
      return [];
    }
    try {
      return await readdir(real, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  async function isDir(rel: string, entry: Dirent): Promise<boolean> {
    if (entry.isDirectory()) {
      return true;
    }
    if (!entry.isSymbolicLink()) {
      return false;
    }
    const real = await resolve(rel);
    if (!real) {
      return false;
    }
    const info = await stat(real).catch(() => null);
    return info?.isDirectory() === true;
  }

  async function listDirs(rel: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await entriesOf(rel)) {
      if (await isDir(path.posix.join(rel, entry.name), entry)) {
        out.push(entry.name);
      }
    }
    return out.sort();
  }

  async function listFiles(
    rel: string,
    limits: { maxDepth: number; maxFiles: number }
  ): Promise<string[]> {
    const out: string[] = [];
    // Links can loop; a real dir is walked once.
    const seen = new Set<string>();
    const walk = async (prefix: string, depth: number) => {
      const dirRel = path.posix.join(rel, prefix);
      const real = await resolve(dirRel);
      if (!real || seen.has(real) || depth > limits.maxDepth) {
        return;
      }
      seen.add(real);
      for (const entry of await entriesOf(dirRel)) {
        if (out.length >= limits.maxFiles) {
          return;
        }
        const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (await isDir(path.posix.join(rel, childPrefix), entry)) {
          if (!SKIPPED_DIRS.has(entry.name)) {
            await walk(childPrefix, depth + 1);
          }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          out.push(childPrefix);
        }
      }
    };
    await walk("", 0);
    return out.sort();
  }

  async function readFile(rel: string, maxBytes: number) {
    const real = await resolve(rel);
    const base = await realRoot();
    if (!(real && base)) {
      return null;
    }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(
        real,
        // biome-ignore lint/suspicious/noBitwiseOperators: open(2) flags are a bitmask.
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      if (!isInside(base, await openedPath(handle.fd, real))) {
        return null;
      }
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxBytes) {
        return null;
      }
      return await handle.readFile();
    } catch {
      return null;
    } finally {
      await handle?.close();
    }
  }

  return { listDirs, listFiles, readFile, resolve };
}

export function openSpaceComputerHome(input: {
  spaceId: string;
  tenantId: string;
}): UntrustedTree {
  return openUntrustedTree(
    resolveSpaceComputerHomePath(input.tenantId, input.spaceId)
  );
}

/** The machine's `/sandbox`, where a project-scope install lands. */
export function openSpaceComputerDrive(input: {
  spaceId: string;
  tenantId: string;
}): UntrustedTree {
  return openUntrustedTree(
    resolveSandboxStorageLayout({
      agentId: "",
      lifecycle: "space",
      runId: "",
      spaceId: input.spaceId,
      tenantId: input.tenantId,
      threadId: "",
    }).stagingPath
  );
}
