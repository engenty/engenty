// Virtual view over the tenant skill filesystem: one storage copy, per-run
// visibility. List/read/search see only allowed skill directories.

import type { ProviderStatus } from "@mastra/core/workspace";
import {
  type CopyOptions,
  DirectoryNotFoundError,
  type FileContent,
  type FileEntry,
  FileNotFoundError,
  type FileStat,
  type ListOptions,
  MastraFilesystem,
  type ReadOptions,
  type RemoveOptions,
  type WorkspaceFilesystem,
  type WriteOptions,
} from "@mastra/core/workspace";

const SKILL_TIERS = new Set(["managed", "custom"]);

type LifecycleFilesystem = WorkspaceFilesystem & {
  _destroy?: () => Promise<void>;
  _init?: () => Promise<void>;
};

function pathSegments(path: string): string[] {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

/**
 * Skill directory name addressed by a path relative to the `/skills` mount,
 * or null for the mount root, a tier directory, or a tier-level dotfile.
 */
export function skillNameFromMountPath(path: string): string | null {
  const parts = pathSegments(path);
  if (parts.length < 2) {
    return null;
  }
  const [tier, name] = parts;
  if (!(tier && name && SKILL_TIERS.has(tier))) {
    return null;
  }
  if (name.startsWith(".")) {
    return null;
  }
  return name;
}

function isTierDirectory(path: string): boolean {
  const parts = pathSegments(path);
  return parts.length === 1 && SKILL_TIERS.has(parts[0] ?? "");
}

export class FilteredSkillFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = "FilteredSkillFilesystem";
  readonly provider = "engenty-filtered-skills";
  status: ProviderStatus = "pending";

  private readonly allowed: ReadonlySet<string>;
  private readonly inner: LifecycleFilesystem;

  constructor(inner: WorkspaceFilesystem, allowedSkillNames: Iterable<string>) {
    super({ name: "FilteredSkillFilesystem" });
    this.inner = inner;
    this.id = `filtered-${inner.id}`;
    this.allowed = new Set(
      [...allowedSkillNames].map((name) => name.trim()).filter(Boolean)
    );
  }

  async init(): Promise<void> {
    if (typeof this.inner._init === "function") {
      await this.inner._init();
    }
  }

  async destroy(): Promise<void> {
    if (typeof this.inner._destroy === "function") {
      await this.inner._destroy();
    }
  }

  async readFile(
    path: string,
    options?: ReadOptions
  ): Promise<string | Buffer> {
    this.assertSkillVisible(path);
    return this.inner.readFile(path, options);
  }

  async writeFile(
    path: string,
    content: FileContent,
    options?: WriteOptions
  ): Promise<void> {
    this.assertSkillVisible(path);
    return this.inner.writeFile(path, content, options);
  }

  async appendFile(path: string, content: FileContent): Promise<void> {
    this.assertSkillVisible(path);
    return this.inner.appendFile(path, content);
  }

  async deleteFile(path: string, options?: RemoveOptions): Promise<void> {
    this.assertSkillVisible(path);
    return this.inner.deleteFile(path, options);
  }

  async copyFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    this.assertSkillVisible(src);
    this.assertSkillVisible(dest);
    return this.inner.copyFile(src, dest, options);
  }

  async moveFile(
    src: string,
    dest: string,
    options?: CopyOptions
  ): Promise<void> {
    this.assertSkillVisible(src);
    this.assertSkillVisible(dest);
    return this.inner.moveFile(src, dest, options);
  }

  async mkdir(
    path: string,
    options?: {
      recursive?: boolean;
    }
  ): Promise<void> {
    this.assertSkillVisible(path);
    return this.inner.mkdir(path, options);
  }

  async rmdir(path: string, options?: RemoveOptions): Promise<void> {
    this.assertSkillVisible(path, "directory");
    return this.inner.rmdir(path, options);
  }

  async readdir(path: string, options?: ListOptions): Promise<FileEntry[]> {
    this.assertSkillVisible(path, "directory");
    const entries = await this.inner.readdir(path, options);
    if (!isTierDirectory(path)) {
      return entries;
    }
    return entries.filter(
      (entry) => entry.type !== "directory" || this.allowed.has(entry.name)
    );
  }

  async exists(path: string): Promise<boolean> {
    if (this.hiddenSkillName(path)) {
      return false;
    }
    return this.inner.exists(path);
  }

  async stat(path: string): Promise<FileStat> {
    this.assertSkillVisible(path);
    return this.inner.stat(path);
  }

  private hiddenSkillName(path: string): string | null {
    const name = skillNameFromMountPath(path);
    if (name && !this.allowed.has(name)) {
      return name;
    }
    return null;
  }

  private assertSkillVisible(
    path: string,
    kind: "file" | "directory" = "file"
  ): void {
    if (!this.hiddenSkillName(path)) {
      return;
    }
    if (kind === "directory") {
      throw new DirectoryNotFoundError(path);
    }
    throw new FileNotFoundError(path);
  }
}

export function wrapSkillFilesystem(
  inner: WorkspaceFilesystem,
  allowedSkillNames: Iterable<string>
): WorkspaceFilesystem {
  return new FilteredSkillFilesystem(inner, allowedSkillNames);
}
