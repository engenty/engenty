/**
 * The agent's `/data` mount as a REAL filesystem (PLAN-space-data-agent-crud P1.5).
 *
 * This replaces a `FilesSDKFilesystem` wrapped around an object-store adapter,
 * and the reason is one method. `FilesSDKFilesystem.mkdir` is a documented
 * **no-op** — object storage has no directories — so an agent that called
 * `mkdir("/data/Files/Verträge")` got success, listed the folder, found
 * nothing, and called `mkdir` again. A tool that reports success and changes
 * nothing does not merely fail; it produces a loop, and the agent has no way to
 * tell that from a slow write.
 *
 * The `WorkspaceFilesystem` contract already declares `mkdir`, `rmdir`,
 * `moveFile`, `copyFile` and `deleteFile`. It was never Mastra that could not
 * express a folder — it was the object-shaped wrapper we had chosen. So this
 * implements the contract directly against the data endpoints, and each method
 * maps onto exactly one of them:
 *
 * | filesystem | endpoint                          |
 * |------------|-----------------------------------|
 * | readFile   | `/data/read`                      |
 * | writeFile  | `/data/read` then `/data/write`   |
 * | mkdir      | `/data/create` `{kind:"folder"}`  |
 * | deleteFile | `/data/delete`                    |
 * | rmdir      | `/data/delete` `{recursive}`      |
 * | moveFile   | `/data/move`                      |
 * | copyFile   | `/data/read` then `/data/create`  |
 * | readdir    | `/data/list`                      |
 *
 * **Nothing is faked.** An adapter that has no `createNode` answers 405, and
 * that surfaces to the agent as a typed "not supported here" — which is
 * strictly better than a silent success, because it is actionable. Contacts
 * refusing `mkdir` while Files accepts it is the tree telling the truth about
 * two different modules.
 *
 * The files-sdk adapter stays for sandbox STAGING (D6), where a read-through
 * object cache is genuinely the right shape.
 */

import type { ProviderStatus } from "@mastra/core/workspace";
import {
  DirectoryNotFoundError,
  type FileContent,
  type FileEntry,
  FileExistsError,
  FileNotFoundError,
  type FileStat,
  type ListOptions,
  MastraFilesystem,
  type ReadOptions,
  type RemoveOptions,
  type WriteOptions,
} from "@mastra/core/workspace";
import {
  createSpaceDataClient,
  type SpaceDataClient,
  type SpaceDataDocumentDto,
  SpaceDataRequestError,
} from "./space-data-client.js";

export interface SpaceDataFilesystemOptions {
  accessToken: string;
  agentId?: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
  id?: string;
  readOnly?: boolean;
  spaceId: string;
}

/**
 * Normalize a module path and preserve one compatibility-only 404 guard.
 *
 * Old transcripts/tools sometimes sent a non-module path directly below
 * `/data`. Current instructions forbid that shape. Remapping it under the real
 * Files root keeps the old request from ending at a missing top-level module;
 * it is not guidance for constructing new paths.
 */
const SPACE_DATA_MODULE_ROOT = /^[A-Z][A-Za-z0-9]+$/;
const SPACE_DATA_FILES_ROOT = "Files";

function compatibility404GuardTreePath(path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) {
    return "";
  }
  const root = clean.split("/")[0] ?? "";
  if (root && SPACE_DATA_MODULE_ROOT.test(root)) {
    return clean;
  }
  return `${SPACE_DATA_FILES_ROOT}/${clean}`;
}

function parentOf(path: string): string {
  const clean = compatibility404GuardTreePath(path);
  const index = clean.lastIndexOf("/");
  return index === -1 ? "" : clean.slice(0, index);
}

function nameOf(path: string): string {
  const clean = compatibility404GuardTreePath(path);
  const index = clean.lastIndexOf("/");
  return index === -1 ? clean : clean.slice(index + 1);
}

/**
 * The bundle member a path addresses, or null when it names a whole node.
 *
 * A bundle is a directory whose NAME carries a record id (`x__<uuid>.offer/`),
 * so a segment containing `__` that is not the last one marks the boundary
 * between the node and the member inside it.
 */
function splitMember(path: string): { member: string | null; node: string } {
  const segments = compatibility404GuardTreePath(path)
    .split("/")
    .filter(Boolean);
  const bundleIndex = segments.findIndex((segment, index) =>
    index < segments.length - 1 ? segment.includes("__") : false
  );
  if (bundleIndex === -1) {
    return { member: null, node: segments.join("/") };
  }
  return {
    member: segments.slice(bundleIndex + 1).join("/"),
    node: segments.slice(0, bundleIndex + 1).join("/"),
  };
}

function bytesOf(content: FileContent): string {
  if (typeof content === "string") {
    return content;
  }
  return new TextDecoder().decode(
    content instanceof Uint8Array ? content : new Uint8Array(content)
  );
}

export class SpaceDataFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = "SpaceDataFilesystem";
  readonly provider = "engenty-space-data";
  readonly readOnly: boolean;
  status: ProviderStatus = "pending";

  private readonly client: SpaceDataClient;

  constructor(options: SpaceDataFilesystemOptions) {
    super({ name: "SpaceDataFilesystem" });
    this.id = options.id ?? "space-data";
    this.readOnly = options.readOnly ?? false;
    this.client = createSpaceDataClient({
      accessToken: options.accessToken,
      coreBaseUrl: options.coreBaseUrl,
      spaceId: options.spaceId,
      ...(options.agentId ? { agentId: options.agentId } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  init(): Promise<void> {
    // Nothing to provision: the tree is a projection of stores that already
    // exist, and the space's mounts decide what it contains.
    this.status = "ready";
    return Promise.resolve();
  }

  /**
   * What an agent needs to know that a generic filesystem prompt cannot say.
   *
   * Chiefly: which gestures a given folder supports is the MODULE's answer, not
   * this filesystem's, so "not supported here" is information rather than a
   * malfunction.
   */
  getInstructions(): string {
    return [
      "/data is the space's Data tree: each top-level folder is a module mounted in this space,",
      "and its contents are that module's real records, not copies. Reading or writing a file here",
      "runs the module's own operation, so a write can require a human approval and will say so.",
      "Modules differ in what they allow: creating a folder works where folders are real (the space's",
      "own Files), and is refused where a 'new item' means a record with a schema (Contacts, Offers).",
      "User-uploaded files and connected folders are under /data/Files. List that root (not only Documents/Images) before asking which file.",
      "Workspace BM25 search does not index /data — list and read, or grep the path you listed.",
      "Do not park conversation notes here; observational memory and the chat reply carry context. Do not create a new top-level folder beside the modules.",
      "A refusal naming the module's own action is the answer, not an error to retry.",
    ].join(" ");
  }

  private assertWritable(path: string): void {
    if (this.readOnly) {
      throw new SpaceDataRequestError(
        403,
        "read_only",
        `/data is mounted read-only in this run; "${path}" cannot be changed.`
      );
    }
  }

  /** Map the data plane's refusals onto the filesystem errors Mastra expects. */
  private static rethrow(path: string, error: unknown): never {
    if (error instanceof SpaceDataRequestError && error.status === 404) {
      throw new FileNotFoundError(path);
    }
    throw error;
  }

  private async document(path: string): Promise<SpaceDataDocumentDto> {
    try {
      return await this.client.read(compatibility404GuardTreePath(path));
    } catch (error) {
      return SpaceDataFilesystem.rethrow(path, error);
    }
  }

  async readFile(
    path: string,
    options?: ReadOptions
  ): Promise<string | Buffer> {
    await this.ensureReady();
    const { member, node } = splitMember(path);
    const document = await this.document(member ? `${node}/${member}` : node);
    const found = member
      ? document.members.find((entry) => entry.name === member)
      : document.members[0];
    if (!found) {
      throw new FileNotFoundError(path);
    }
    const buffer = Buffer.from(
      found.content,
      found.encoding === "base64" ? "base64" : "utf8"
    );
    return options?.encoding ? buffer.toString(options.encoding) : buffer;
  }

  /**
   * Write a node, reading its version first.
   *
   * The base version is READ here rather than demanded from the caller: an
   * agent's `write_file` carries no version, and refusing every agent write for
   * that reason would make the mount read-only in practice. The read happens
   * immediately before the write and the SERVER still compares, so a genuinely
   * concurrent edit is refused 409 rather than overwritten — the window is the
   * request itself, not the agent's whole turn.
   */
  async writeFile(
    path: string,
    content: FileContent,
    _options?: WriteOptions
  ): Promise<void> {
    await this.ensureReady();
    this.assertWritable(path);
    const { member, node } = splitMember(path);
    const current = await this.document(member ? `${node}/${member}` : node);
    await this.client.write({
      baseVersion: current.version,
      content: bytesOf(content),
      path: node,
      ...(member ? { member } : {}),
    });
  }

  async appendFile(path: string, content: FileContent): Promise<void> {
    const existing = await this.readFile(path, { encoding: "utf8" });
    await this.writeFile(path, `${String(existing)}${bytesOf(content)}`);
  }

  async deleteFile(path: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    this.assertWritable(path);
    try {
      await this.client.remove({
        path: compatibility404GuardTreePath(path),
        recursive: false,
      });
    } catch (error) {
      if (
        options?.force &&
        error instanceof SpaceDataRequestError &&
        error.status === 404
      ) {
        return;
      }
      SpaceDataFilesystem.rethrow(path, error);
    }
  }

  /**
   * Remove a directory, cascading only when asked.
   *
   * `recursive` travels straight through to the adapter, which is where the
   * cascade actually lives — for the space's files it takes every child AND
   * their stored bytes. Defaulting it to false here would be pointless; the
   * point is that the flag the caller set is the flag the module sees.
   */
  async rmdir(path: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    this.assertWritable(path);
    try {
      await this.client.remove({
        path: compatibility404GuardTreePath(path),
        recursive: options?.recursive ?? false,
      });
    } catch (error) {
      if (
        options?.force &&
        error instanceof SpaceDataRequestError &&
        error.status === 404
      ) {
        return;
      }
      SpaceDataFilesystem.rethrow(path, error);
    }
  }

  /**
   * Make a real folder. THIS is the method the rewrite exists for.
   *
   * `recursive` walks the missing levels one create at a time rather than
   * asking the endpoint for a deep create: each level is a separate operation
   * with its own approval and audit row, and an endpoint that made four folders
   * from one call would be one approval covering four changes.
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.ensureReady();
    this.assertWritable(path);
    const segments = compatibility404GuardTreePath(path)
      .split("/")
      .filter(Boolean);
    if (segments.length === 0) {
      return;
    }
    const start = options?.recursive ? 1 : segments.length - 1;
    for (let index = start; index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join("/");
      const name = segments[index];
      if (!(name && parentPath)) {
        // The tree's top level is the set of MOUNTED MODULES. A folder cannot
        // be made beside them, because that would mean mounting a module.
        throw new DirectoryNotFoundError(
          `/data's top level is the modules this space mounts; a folder must be created inside one of them.`
        );
      }
      try {
        await this.client.create({ kind: "folder", name, parentPath });
      } catch (error) {
        if (
          options?.recursive &&
          error instanceof SpaceDataRequestError &&
          error.status === 409
        ) {
          // Already there. `mkdir -p` semantics: an existing level is the
          // desired state, not a collision.
          continue;
        }
        if (error instanceof SpaceDataRequestError && error.status === 409) {
          throw new FileExistsError(path);
        }
        SpaceDataFilesystem.rethrow(path, error);
      }
    }
  }

  async moveFile(src: string, dest: string): Promise<void> {
    await this.ensureReady();
    this.assertWritable(src);
    const toParentPath = parentOf(dest);
    const newName = nameOf(dest);
    try {
      await this.client.move({
        path: compatibility404GuardTreePath(src),
        ...(newName && newName !== nameOf(src) ? { newName } : {}),
        ...(toParentPath === parentOf(src) ? {} : { toParentPath }),
      });
    } catch (error) {
      SpaceDataFilesystem.rethrow(src, error);
    }
  }

  /**
   * Copy by composition: read the source, create at the destination.
   *
   * Deliberately NOT an adapter method. A copy that a module had to implement
   * would be a second way to mint a record, sidestepping the schema its own
   * create operation applies — so the tree composes the two gestures it already
   * has, and a module that refuses either refuses the copy for the same reason.
   */
  async copyFile(src: string, dest: string): Promise<void> {
    await this.ensureReady();
    this.assertWritable(dest);
    const content = await this.readFile(src, { encoding: "utf8" });
    try {
      await this.client.create({
        content: String(content),
        kind: "node",
        name: nameOf(dest),
        parentPath: parentOf(dest),
      });
    } catch (error) {
      SpaceDataFilesystem.rethrow(dest, error);
    }
  }

  async readdir(path: string, _options?: ListOptions): Promise<FileEntry[]> {
    await this.ensureReady();
    const clean = compatibility404GuardTreePath(path);
    if (!clean) {
      // The tree's root is the mounted modules — each one a directory.
      const roots = await this.client.roots();
      return roots.map((root) => ({ name: root.root, type: "directory" }));
    }
    let listing: Awaited<ReturnType<SpaceDataClient["list"]>>;
    try {
      listing = await this.client.list(clean);
    } catch (error) {
      if (error instanceof SpaceDataRequestError && error.status === 404) {
        throw new DirectoryNotFoundError(path);
      }
      throw error;
    }
    return [
      ...listing.folders.map(
        (folder): FileEntry => ({
          name: nameOf(folder.path),
          type: "directory",
        })
      ),
      ...listing.entries.map(
        (entry): FileEntry => ({
          name: nameOf(entry.path),
          // A BUNDLE is a directory: humans see one row, the agent sees the
          // members inside. Presenting it as a file would hide its parts.
          type: entry.kind === "bundle" ? "directory" : "file",
        })
      ),
    ];
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureReady();
    const clean = compatibility404GuardTreePath(path);
    if (!clean) {
      return true;
    }
    try {
      await this.client.read(clean);
      return true;
    } catch (error) {
      if (!(error instanceof SpaceDataRequestError)) {
        throw error;
      }
      if (error.status !== 404 && error.status !== 400) {
        throw error;
      }
    }
    // Not a node — it may still be a folder, and a folder is only ever seen by
    // listing it.
    try {
      await this.client.list(clean);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FileStat> {
    await this.ensureReady();
    const clean = compatibility404GuardTreePath(path);
    const now = new Date();
    if (!clean) {
      return {
        createdAt: now,
        modifiedAt: now,
        name: "data",
        path,
        size: 0,
        type: "directory",
      };
    }
    try {
      const document = await this.client.read(clean);
      const member = document.members[0];
      const modifiedAt = document.updatedAt
        ? new Date(document.updatedAt)
        : now;
      return {
        createdAt: modifiedAt,
        modifiedAt,
        name: document.name,
        path,
        size: member ? Buffer.byteLength(member.content) : 0,
        type: document.kind === "bundle" ? "directory" : "file",
        ...(member ? { mimeType: member.contentType } : {}),
      };
    } catch (error) {
      if (!(error instanceof SpaceDataRequestError)) {
        throw error;
      }
      if (error.status !== 404 && error.status !== 400) {
        throw error;
      }
    }
    try {
      await this.client.list(clean);
      return {
        createdAt: now,
        modifiedAt: now,
        name: nameOf(clean),
        path,
        size: 0,
        type: "directory",
      };
    } catch {
      throw new FileNotFoundError(path);
    }
  }
}
