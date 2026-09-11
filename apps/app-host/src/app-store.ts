import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assertAppId } from "./runtime.js";

const exec = promisify(execFile);

/**
 * Where an App lives on this host. Every App is one directory on the spaces
 * tree, named by the space it belongs to and its own slug — the same tree the
 * space computer binds, so an agent and the App it wrote see one set of files.
 *
 *   <spacesDir>/tenants/<tenant>/spaces/<space>/apps/<slug>/
 *     src/    git work tree; a release is a commit
 *     data/   mounted read-write at /data inside the App's isolate
 *
 * An App created outside any space lives under <spacesDir>/tenants/<tenant>/
 * apps/<slug> and is bound into no space computer.
 *
 * The replica actor knows nothing but its app id when it boots, so every App
 * also has an index link, <spacesDir>/apps/<appId> → that directory. The link
 * is (re)made on every deploy and every source write.
 */
export interface AppPlacement {
  slug: string;
  spaceId: string | null;
  tenantId: string;
}

const ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SLUG_SEGMENT = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SOURCE_PATH =
  /^(?!\/)(?!.*(^|\/)\.\.(\/|$))(?!\.git(\/|$))[A-Za-z0-9._\-/]+$/;

export function assertPlacement(placement: AppPlacement): void {
  if (!ID_SEGMENT.test(placement.tenantId)) {
    throw new Error(`invalid tenant id "${placement.tenantId}"`);
  }
  if (placement.spaceId !== null && !ID_SEGMENT.test(placement.spaceId)) {
    throw new Error(`invalid space id "${placement.spaceId}"`);
  }
  if (!SLUG_SEGMENT.test(placement.slug)) {
    throw new Error(`invalid app slug "${placement.slug}"`);
  }
}

export function assertSourcePath(filePath: string): void {
  if (!SOURCE_PATH.test(filePath) || filePath.length > 200) {
    throw new Error(`invalid source path "${filePath}"`);
  }
}

export interface SourceWrite {
  delete?: string[];
  files?: Record<string, string>;
  message: string;
}

export interface SourceCommit {
  /** True when the commit was made now; false when the tree was already clean. */
  changed: boolean;
  sha: string;
}

export interface SourceTree {
  files: Record<string, string>;
  sha: string;
}

export class AppStore {
  private readonly spacesDir: string;
  private readonly maxSourceBytes: number;

  constructor(options: { maxSourceBytes: number; spacesDir: string }) {
    this.spacesDir = options.spacesDir;
    this.maxSourceBytes = options.maxSourceBytes;
  }

  appDir(placement: AppPlacement): string {
    assertPlacement(placement);
    return path.join(
      this.spacesDir,
      "tenants",
      placement.tenantId,
      ...(placement.spaceId ? ["spaces", placement.spaceId] : []),
      "apps",
      placement.slug
    );
  }

  /** The index link the replica mount follows. */
  linkPath(appId: string): string {
    assertAppId(appId);
    return path.join(this.spacesDir, "apps", appId);
  }

  /**
   * `/data` for the App's isolate. Resolved through the index link, which the
   * last deploy left in place; an App that was never deployed on this host has
   * no directory, and that is an error worth hearing about rather than an
   * empty directory quietly created in the wrong place.
   */
  dataDir(appId: string): string {
    const link = this.linkPath(appId);
    if (!existsSync(link)) {
      throw new Error(
        `app ${appId} has no directory on this host — deploy it again`
      );
    }
    return path.join(link, "data");
  }

  /** Create the App's directory, its repository and its index link. */
  async place(appId: string, placement: AppPlacement): Promise<string> {
    const dir = this.appDir(placement);
    const src = path.join(dir, "src");
    mkdirSync(src, { recursive: true });
    mkdirSync(path.join(dir, "data"), { recursive: true });
    if (!existsSync(path.join(src, ".git"))) {
      await git(src, ["init", "-q", "-b", "main"]);
    }
    const link = this.linkPath(appId);
    mkdirSync(path.dirname(link), { recursive: true });
    let current: string | null = null;
    try {
      current = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "";
    } catch {
      current = null;
    }
    if (current === "") {
      throw new Error(
        `${link} exists and is not a link — the app index is corrupt`
      );
    }
    if (current !== dir) {
      if (current !== null) {
        rmSync(link);
      }
      symlinkSync(dir, link);
    }
    return dir;
  }

  /**
   * Apply writes and deletes to the work tree, then commit whatever the tree
   * holds — including edits an agent made through the space computer without
   * committing. A clean tree commits nothing and answers with HEAD.
   */
  async writeSource(
    appId: string,
    placement: AppPlacement,
    write: SourceWrite
  ): Promise<SourceCommit> {
    const src = path.join(await this.place(appId, placement), "src");
    for (const [filePath, content] of Object.entries(write.files ?? {})) {
      assertSourcePath(filePath);
      const target = path.join(src, filePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    for (const filePath of write.delete ?? []) {
      assertSourcePath(filePath);
      rmSync(path.join(src, filePath), { force: true, recursive: true });
    }
    await git(src, ["add", "-A"]);
    const status = await git(src, ["status", "--porcelain"]);
    const hasHead = await git(src, ["rev-parse", "--verify", "-q", "HEAD"])
      .then(() => true)
      .catch(() => false);
    if (status.trim() === "" && hasHead) {
      return { changed: false, sha: await head(src) };
    }
    await git(src, ["commit", "-q", "--allow-empty", "-m", write.message]);
    return { changed: true, sha: await head(src) };
  }

  /** The complete tree at a commit — what a release is built from. */
  async readSource(appId: string, ref: string): Promise<SourceTree> {
    const src = path.join(this.linkPath(appId), "src");
    if (!/^[A-Za-z0-9_./~^-]{1,128}$/.test(ref) || ref.startsWith("-")) {
      throw new Error(`invalid git ref "${ref}"`);
    }
    const sha = (
      await git(src, ["rev-parse", "--verify", `${ref}^{commit}`])
    ).trim();
    const listing = await git(src, ["ls-tree", "-r", "-l", "-z", sha]);
    const files: Record<string, string> = {};
    let bytes = 0;
    for (const entry of listing.split("\0")) {
      if (!entry) {
        continue;
      }
      // "<mode> <type> <object> <size>\t<path>"
      const tab = entry.indexOf("\t");
      const [, type, , size] = entry.slice(0, tab).split(/\s+/);
      const filePath = entry.slice(tab + 1);
      if (type !== "blob") {
        continue;
      }
      bytes += Number(size);
      if (bytes > this.maxSourceBytes) {
        throw new Error(
          `app source at ${sha.slice(0, 7)} is over the ${this.maxSourceBytes} byte limit`
        );
      }
      files[filePath] = await git(src, ["show", `${sha}:${filePath}`]);
    }
    return { files, sha };
  }
}

async function head(src: string): Promise<string> {
  return (await git(src, ["rev-parse", "HEAD"])).trim();
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "apps@engenty.local",
      GIT_AUTHOR_NAME: "engenty",
      GIT_COMMITTER_EMAIL: "apps@engenty.local",
      GIT_COMMITTER_NAME: "engenty",
      GIT_TERMINAL_PROMPT: "0",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}
