/**
 * The agent's `/data` mount (PLAN-space-data.md D4).
 *
 * A THIRD Files SDK adapter beside `files-sdk/supabase` and `files-sdk/fs`,
 * and the only one whose "objects" are not objects: every key it serves is a
 * node of the space's Data tree, and every read and write it performs is a
 * call to `/api/spaces/<id>/data/*` **as the run's principal**. So
 * `mastra_workspace_read_file("/data/Contacts/People/anna__<id>.contact.md")` is a
 * `contacts_get`, and writing that file is a `contacts_update` — with the same
 * capability check, the same audit row, and the same approval card the
 * equivalent tool call would raise.
 *
 * That is the whole reason this is an adapter rather than a sync: nothing is
 * copied anywhere, so there is no second authorization surface and no
 * reconciliation to get wrong. The mount is a lens on the operation pipeline.
 *
 * Key layout, mirroring the tree exactly:
 *
 *   Contacts/People/anna__<id>.contact.md     ← a record: one file
 *   Offers/draft/relaunch__<id>.offer/offer.json   ← a bundle member
 *
 * `list` is prefix-based like every other adapter, so `list({prefix: "Offers/"})`
 * walks the adapter's folders; unlike an object store it costs one request per
 * level, which is why the agent tools' recursive walks are bounded below.
 */

import type {
  Adapter,
  Body,
  ListOptions,
  ListResult,
  StoredFile,
  UploadResult,
} from "files-sdk";
import { SpaceDataRequestError } from "./space-data-client.js";

export { SpaceDataRequestError } from "./space-data-client.js";

/** How deep a recursive `list` walks before it stops descending. */
const MAX_LIST_DEPTH = 4;
/** How many nodes one `list` may return, whatever the depth. */
const MAX_LIST_ENTRIES = 500;

interface DataMember {
  content: string;
  contentType: string;
  derived: boolean;
  editable: boolean;
  encoding: "base64" | "utf8";
  name: string;
}

interface DataDocument {
  kind: "bundle" | "record";
  members: DataMember[];
  name: string;
  nodeType: string;
  path: string;
  recordId: string;
  updatedAt?: string;
  version: string;
}

interface DataListing {
  entries: Array<{
    kind: "bundle" | "record";
    name: string;
    path: string;
    recordId: string;
    updatedAt?: string;
    version: string;
  }>;
  folders: Array<{ name: string; path: string }>;
  truncated?: boolean;
}

interface DataRoot {
  label: string;
  moduleId: string;
  root: string;
  writable: boolean;
}

export interface SpaceDataAdapterOptions {
  accessToken: string;
  /**
   * The agent's `core.agents` principal uuid, forwarded so a gated write
   * escalates to an approval. NOT the AI-plane agent key — core matches it
   * against uuid grant columns and a key fails the query outright.
   */
  agentId?: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
  spaceId: string;
}

/**
 * ONE error class, shared with `SpaceDataFilesystem` (P1.5).
 *
 * Re-exported rather than redeclared: two classes with this name would both
 * look right at every call site and fail every `instanceof` across the seam —
 * the staging adapter's 404 would not be the filesystem's 404, and the
 * force-delete and exists paths that turn on exactly that check would quietly
 * stop working.
 */
function textEncoderLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * A `StoredFile` over bytes we already hold.
 *
 * The SDK's contract is File-like — `text()`, `arrayBuffer()`, `stream()`,
 * `blob()` — and a record's "bytes" are a string we just rendered, so every
 * accessor resolves from the same buffer. Hand-built rather than wrapping the
 * platform `File`, which would copy the buffer once more for no benefit.
 */
function storedFile(input: {
  bytes: Uint8Array;
  contentType: string;
  key: string;
  lastModified?: number;
}): StoredFile {
  const { bytes } = input;
  const name = input.key.split("/").at(-1) ?? input.key;
  const buffer = () => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer as ArrayBuffer;
  };
  return {
    arrayBuffer: () => Promise.resolve(buffer()),
    blob: () =>
      Promise.resolve(new Blob([buffer()], { type: input.contentType })),
    key: input.key,
    name,
    size: bytes.byteLength,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    text: () => Promise.resolve(new TextDecoder().decode(bytes)),
    type: input.contentType,
    ...(input.lastModified === undefined
      ? {}
      : { lastModified: input.lastModified }),
  };
}

/** The bundle member a key addresses, or null when the key names a whole node. */
function splitMemberKey(key: string): { member: string | null; node: string } {
  const segments = key.split("/").filter(Boolean);
  // A bundle is a directory whose NAME carries the node type's extension; the
  // segment after it is the member. Everything else is a node in its own right.
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

export function createSpaceDataAdapter(
  options: SpaceDataAdapterOptions
): Adapter<SpaceDataAdapterOptions> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `${options.coreBaseUrl.replace(/\/$/, "")}/api/spaces/${encodeURIComponent(
    options.spaceId
  )}/data`;

  async function call<T>(
    path: string,
    init?: { body?: unknown; method?: string }
  ): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        "content-type": "application/json",
        // Same header the tool lane forwards. It only ever ADDS an approval
        // requirement — the token's own capabilities remain the ceiling.
        ...(options.agentId ? { "x-engenty-agent-id": options.agentId } : {}),
      },
      method: init?.method ?? "GET",
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const payload = (await response.json().catch(() => null)) as {
      approvalRequestId?: string;
      data?: unknown;
      error?: { code?: string; message?: string };
      ok?: boolean;
      status?: string;
    } | null;
    // An approval gate arrives as **202 with `ok: false`**, and 202 is inside
    // `response.ok`. Treating it as success is the bug this branch exists to
    // prevent: the agent would report the record changed while a human was
    // still being asked, and would move on from a write that never landed.
    if (payload?.status === "approval_required") {
      throw new SpaceDataRequestError(
        202,
        "approval_required",
        `A human has been asked to approve this change; it is not applied yet.${
          payload.approvalRequestId
            ? ` (request ${payload.approvalRequestId})`
            : ""
        }`
      );
    }
    if (!response.ok) {
      throw new SpaceDataRequestError(
        response.status,
        payload?.error?.code ?? `http_${response.status}`,
        payload?.error?.message ??
          `space data request failed with ${response.status}`
      );
    }
    return (payload?.data ?? payload) as T;
  }

  const documentOf = (key: string) =>
    call<DataDocument>(`/read?path=${encodeURIComponent(key)}`);

  /** Bytes for one key: the whole record, or one member of a bundle. */
  async function readKey(
    key: string
  ): Promise<{ member: DataMember; version: string }> {
    const { member, node } = splitMemberKey(key);
    const document = await documentOf(member ? `${node}/${member}` : node);
    const found = member
      ? document.members.find((entry) => entry.name === member)
      : document.members[0];
    if (!found) {
      throw new SpaceDataRequestError(
        404,
        "member_not_found",
        `"${key}" is not part of this record.`
      );
    }
    return { member: found, version: document.version };
  }

  async function listLevel(path: string): Promise<DataListing> {
    return call<DataListing>(`/list?path=${encodeURIComponent(path)}`);
  }

  /**
   * Walk the tree under a prefix.
   *
   * Bounded by depth and count on purpose: every level is a real request that
   * runs a module's list operation, so an unbounded walk of a mounted address
   * book would be a scan of the tenant's data dressed up as a directory
   * listing. Truncation is reported through the SDK's own paging shape rather
   * than being silent.
   */
  async function walk(prefix: string): Promise<StoredFile[]> {
    const items: StoredFile[] = [];
    const roots = prefix
      ? [prefix.replace(/\/$/, "")]
      : (await call<DataRoot[]>("/roots")).map((root) => root.root);
    const queue = roots.map((path) => ({ depth: 0, path }));
    while (queue.length > 0 && items.length < MAX_LIST_ENTRIES) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      let listing: DataListing;
      try {
        listing = await listLevel(next.path);
      } catch {
        // A folder the caller cannot open is not an error for the WALK — the
        // tree is a view over stores that fail separately, and one closed door
        // must not blank the listing.
        continue;
      }
      for (const entry of listing.entries) {
        items.push(
          storedFile({
            // Size 0: knowing it would mean rendering every record just to
            // list a folder. A listing answers "what is here", and the agent
            // reads the ones it wants.
            bytes: new Uint8Array(0),
            contentType:
              entry.kind === "bundle" ? "inode/directory" : "text/markdown",
            key: `${next.path.split("/")[0]}/${entry.path}`,
            ...(entry.updatedAt
              ? { lastModified: Date.parse(entry.updatedAt) }
              : {}),
          })
        );
      }
      if (next.depth < MAX_LIST_DEPTH) {
        for (const folder of listing.folders) {
          queue.push({
            depth: next.depth + 1,
            path: `${next.path.split("/")[0]}/${folder.path}`,
          });
        }
      }
    }
    return items;
  }

  return {
    name: "engenty-space-data",
    raw: options,

    async copy(): Promise<void> {
      throw new SpaceDataRequestError(
        405,
        "not_supported",
        "Records cannot be copied through the data tree — create one with the module's own action."
      );
    },

    async delete(): Promise<void> {
      // Deliberately absent. Deleting a record is `<module>_delete`, a
      // critical-risk operation with its own approval — reachable as a tool,
      // never as an `rm` on a mount.
      throw new SpaceDataRequestError(
        405,
        "not_supported",
        "Deleting a record is the module's own action, not a file deletion."
      );
    },

    async download(key: string): Promise<StoredFile> {
      const { member } = await readKey(key);
      const body =
        member.encoding === "base64"
          ? Uint8Array.from(atob(member.content), (char) => char.charCodeAt(0))
          : new TextEncoder().encode(member.content);
      return storedFile({
        bytes: body,
        contentType: member.contentType,
        key,
      });
    },

    async exists(key: string): Promise<boolean> {
      try {
        await readKey(key);
        return true;
      } catch (error) {
        if (
          error instanceof SpaceDataRequestError &&
          (error.status === 404 || error.status === 403)
        ) {
          return false;
        }
        throw error;
      }
    },

    async head(key: string): Promise<StoredFile> {
      const { member } = await readKey(key);
      return storedFile({
        bytes: new Uint8Array(
          member.encoding === "base64"
            ? Math.floor((member.content.length * 3) / 4)
            : textEncoderLength(member.content)
        ),
        contentType: member.contentType,
        key,
      });
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      return { items: await walk(opts?.prefix ?? "") };
    },

    /**
     * Write one node, or one member of a bundle.
     *
     * The base version is READ first rather than taken from the caller: an
     * agent's `write_file` carries no version, and refusing every agent write
     * for that reason would make the mount read-only in practice. The read is
     * immediately before the write, so the window a concurrent edit can slip
     * through is the request itself — and the SERVER still compares, so a
     * genuinely concurrent edit is refused 409 rather than overwritten.
     */
    async upload(key: string, body: Body): Promise<UploadResult> {
      const { member, node } = splitMemberKey(key);
      const current = await documentOf(member ? `${node}/${member}` : node);
      const content =
        typeof body === "string"
          ? body
          : new TextDecoder().decode(
              body instanceof Uint8Array
                ? body
                : new Uint8Array(body as ArrayBuffer)
            );
      await call("/write", {
        body: {
          base_version: current.version,
          content,
          path: node,
          ...(member ? { member } : {}),
        },
        method: "PUT",
      });
      return {
        contentType: "text/plain",
        key,
        size: textEncoderLength(content),
      } satisfies UploadResult;
    },

    async signedUploadUrl(): Promise<never> {
      // No pre-signed writes: a write here must run the module's operation, so
      // handing out a URL that bypasses this adapter would be a hole in the
      // one mediation layer the whole design rests on.
      throw new SpaceDataRequestError(
        405,
        "not_supported",
        "Records are written through their module's operation, not by uploading to a URL."
      );
    },

    async url(key: string): Promise<string> {
      // No signed URLs: a record has no bytes at rest to hand out a link to.
      // The read endpoint is the only address it has, and it is authenticated.
      return `${base}/read?path=${encodeURIComponent(key)}`;
    },
  } as unknown as Adapter<SpaceDataAdapterOptions>;
}
