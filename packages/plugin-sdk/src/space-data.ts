/**
 * The space Data protocol — files as PROTOCOL (PLAN-space-data.md §1).
 *
 * One tree per space, three node classes, one storage truth. This file is the
 * contract for the third class: **record nodes**, which are module rows
 * rendered on demand by a per-module {@link SpaceDataAdapter}. Nothing here
 * stores anything and nothing here reads a database — an adapter reaches its
 * module through {@link SpaceDataContext.invokeOperation}, so every read and
 * every write goes through the operation pipeline (capability gating → policy →
 * approval → audit → zod) exactly as the equivalent tool call does.
 *
 * That is the whole design in one sentence: an agent editing
 * `Offers/mueller-relaunch.offer/offer.json` raises the same approval card as
 * calling `offers_update`, BECAUSE IT IS calling `offers_update`.
 *
 * Pure and dependency-light on purpose: modules, core and the UI all import
 * these types, and the tree's rules — how a path decomposes, which member of a
 * bundle may be written, what a version means — are cheaper to pin in one place
 * than to chase through four.
 */

import { PluginOperationError } from "./operation-error.js";

/**
 * What a node IS, from the reader's point of view.
 *
 * `record` — one file. `bundle` — a folder that presents as one item, the way
 * macOS presents `.app`/`.pages` packages: humans see a single row, agents see
 * the directory, and the difference is presentation only (PLAN-space-data.md
 * decision 1).
 */
export type SpaceDataNodeKind = "bundle" | "record";

/** What a mounted module's records may be narrowed to. Mirrors `core.space_mount.record_scope`. */
export type SpaceDataRecordScope = "all" | "space";

/**
 * One member of a bundle, declared by its node type.
 *
 * `derived` is the constraint that keeps "any file type" sound. An offer's
 * `preview.pdf` is a RENDER of the record, not a source of it; editing it is
 * meaningless, so it carries no write mapping and the write path refuses it.
 * Reading may be free-form; **write-back is schema-mapped or it does not
 * exist** — otherwise the write path grows the regex-parsing fragility this
 * design exists to avoid.
 */
export interface SpaceDataMemberSpec {
  contentType: string;
  /** A render of the record, never a source of it. Implies not editable. */
  derived?: boolean;
  /** Has a write mapping onto the module's update operation. */
  editable?: boolean;
  name: string;
}

/**
 * A node type is a FILE TYPE: an extension, a kind, and (for bundles) the
 * members it declares. Adapters declare theirs; there is deliberately no single
 * record format.
 */
export interface SpaceDataNodeType {
  /** `.contact.md`, `.offer` — carried on the node's name. */
  extension: string;
  /** Namespaced, e.g. `contacts.contact`. */
  id: string;
  kind: SpaceDataNodeKind;
  label: string;
  /** Bundles only; the declared members, in presentation order. */
  members?: readonly SpaceDataMemberSpec[];
}

/** A folder in an adapter's tree — module taxonomy or generic structure. */
export interface SpaceDataFolder {
  /**
   * Connector connection behind a mounted folder. Absent on ordinary folders.
   */
  connectionId?: string;
  /** Body of the folder's `index.md`, where it has one. */
  description?: string;
  name: string;
  /**
   * What KIND of folder this is, so its module can render it.
   *
   * A folder here is a virtual object, not a directory: `People` is the
   * contacts whose type is `person`, and `sent` is the offers in that state.
   * Neither is a place bytes live, and both are something their module knows
   * how to present better than a generic listing can — a status folder wants
   * the pipeline's totals, a taxonomy folder wants the taxonomy.
   *
   * Namespaced by module like a node type (`contacts.folder`, `offers.status`)
   * and OPTIONAL: a folder without one is listed generically, which is the
   * right answer for a plain directory and for every adapter that has not
   * grown a view yet.
   */
  nodeType?: string;
  /** Relative to the adapter root, no leading slash. */
  path: string;
}

/**
 * One node in a listing.
 *
 * `version` is the optimistic-concurrency token — the record's `updated_at` for
 * every adapter so far. A write presents the version it read; a mismatch is a
 * 409, never a silent overwrite (PLAN-space-data.md §1b, Concurrency).
 */
export interface SpaceDataEntry {
  kind: SpaceDataNodeKind;
  /** MIME type, when the adapter knows it (file-space records). */
  mimeType?: string;
  /** Includes the node type's extension. */
  name: string;
  nodeType: string;
  /** Relative to the adapter root, no leading slash. */
  path: string;
  /** Identity is the record id, never the path. */
  recordId: string;
  sizeBytes?: number;
  /**
   * What a reader should SEE, where the file name is not it.
   *
   * `name` is the file: `sicherheit-an-bord__019fea70-….article.md`, slugged
   * and carrying an id, because that is what a path segment has to be. A tree
   * row showing that is showing plumbing. Recovering the title by un-slugging
   * the stem is not an option either — it loses every capital and every umlaut,
   * and "Sicherheit an Bord" would come back as "sicherheit an bord".
   *
   * Optional: an adapter whose names are already readable (`contacts.csv`)
   * omits it, and consumers fall back to `name`.
   */
  title?: string;
  updatedAt?: string;
  version: string;
}

export interface SpaceDataListing {
  entries: SpaceDataEntry[];
  folders: SpaceDataFolder[];
  /**
   * The folder being listed, as itself.
   *
   * A listing otherwise describes only what is INSIDE a folder, which leaves
   * the one thing a folder's own page needs — its type — reachable only by
   * listing the parent and searching it, and unreachable at a root, which has
   * no parent. Optional: without it the pane titles the folder from the last
   * path segment and renders it generically, which is the right answer for an
   * adapter that has no view of its own.
   *
   * The server fills it in for a ROOT from the adapter's own `label` and
   * `rootNodeType`, so no adapter has to describe a folder it never lists.
   */
  self?: SpaceDataFolder;
  /** True when the adapter capped the page; the tree says so rather than lying. */
  truncated?: boolean;
}

export interface SpaceDataMember {
  content: string;
  contentType: string;
  derived: boolean;
  editable: boolean;
  encoding: SpaceDataEncoding;
  name: string;
}

export type SpaceDataEncoding = "base64" | "utf8";

/**
 * A node, read.
 *
 * A `record` carries exactly one member whose name is the node's own name; a
 * `bundle` carries the members its node type declares. One shape for both, so
 * the file face and the UI never branch on kind to find the bytes.
 */
export interface SpaceDataDocument {
  kind: SpaceDataNodeKind;
  members: SpaceDataMember[];
  name: string;
  nodeType: string;
  path: string;
  recordId: string;
  updatedAt?: string;
  version: string;
}

/**
 * What an adapter is handed for one request.
 *
 * Deliberately NOT a database handle. `invokeOperation` is the module's own
 * registered operation, dispatched by core with the CALLER's principal, so the
 * adapter cannot reach data the caller could not have reached by calling the
 * operation directly. An adapter that wants a shortcut around this is a bug.
 */
export interface SpaceDataContext {
  invokeOperation: (operationId: string, input?: unknown) => Promise<unknown>;
  /** From the space's mount row; `all` when the mount left it undecided. */
  recordScope: SpaceDataRecordScope;
  spaceId: string;
  tenantId: string;
}

/** A write against one node, or one member of a bundle. */
export interface SpaceDataWriteInput {
  /** The version the writer READ. Mismatch → 409 `data_conflict`. */
  baseVersion: string;
  content: string;
  encoding?: SpaceDataEncoding;
  /** Member name inside a bundle; absent for a single-file record. */
  member?: string;
  /** Relative to the adapter root, no leading slash. */
  path: string;
}

/** Outcome of a bulk collection write (D5) — never a silent save. */
export interface SpaceDataImportResult {
  created: number;
  failed: Array<{ reason: string; row: number }>;
  updated: number;
}

/**
 * Make a new folder or node inside an adapter's tree.
 *
 * `kind` is what the CALLER wants, not what the adapter stores: a folder is
 * whatever that module's containment happens to be (a `file_folders` row, a
 * category, a status), and a node is a record. An adapter that has only one of
 * the two refuses the other rather than inventing it.
 */
export interface SpaceDataCreateInput {
  /** Initial member content for a node; folders ignore it. */
  content?: string;
  encoding?: SpaceDataEncoding;
  kind: "folder" | "node";
  /** Display name. The adapter mints the path — identity is never the path. */
  name: string;
  /** The adapter's own node type; folders may omit it. */
  nodeType?: string;
  /** Relative to the adapter root; `""` is the root itself. */
  parentPath: string;
}

/**
 * Remove one node.
 *
 * `recursive` is the caller's INTENT, not permission: an adapter whose folders
 * cascade is free to refuse a non-recursive delete of a non-empty folder, and
 * one whose containment is a field may ignore the flag entirely. What no
 * adapter may do is delete children when the caller did not ask to.
 */
export interface SpaceDataDeleteInput {
  /** The version the caller READ. Mismatch → 409 `data_conflict`. */
  baseVersion?: string;
  /** Relative to the adapter root, no leading slash. */
  path: string;
  /** Folders only: take the children too. */
  recursive?: boolean;
}

/**
 * Move and/or rename one node.
 *
 * Both fields optional and at least one required, so a rename is a move that
 * did not change parent — one operation rather than two that can disagree.
 */
export interface SpaceDataMoveInput {
  /** The version the mover READ. Mismatch → 409 `data_conflict`. */
  baseVersion?: string;
  /** Absent ⇒ keep the current name. */
  newName?: string;
  /** Relative to the adapter root, no leading slash. */
  path: string;
  /** Absent ⇒ keep the current parent (a pure rename). `""` is the root. */
  toParentPath?: string;
}

/**
 * A module's face in the space Data tree.
 *
 * `root` is the folder the module occupies at the tree's top level, and it is
 * visible **if and only if** the module is mounted in the space — unless
 * {@link alwaysVisible} is set. Mount = grant gets its fourth reader here
 * (PLAN-space-data.md §1c). `alwaysVisible` is the exception for space-native
 * roots that must not require a Work-tab app.
 */
export interface SpaceDataAdapter {
  /**
   * Show this root even when the module is not mounted in the space.
   *
   * Space-native roots are visible to humans and to agents in the space.
   * This is not a grant bypass for a Work-tab module.
   */
  alwaysVisible?: boolean;
  /**
   * Make a folder or a node. Absent ⇒ this module has no "new" that a file
   * gesture can express.
   *
   * Absent is the RIGHT answer for a record module and contacts, offers and
   * invoices all leave it so: creating a contact is `contacts_create` with a
   * schema behind it, and a tree that let `touch` mint a half-formed record
   * would be the schema-mapped rule (§1b) quietly broken from the file side.
   * Present where a folder is a real thing the module already owns.
   */
  createNode?: (
    ctx: SpaceDataContext,
    input: SpaceDataCreateInput
  ) => Promise<SpaceDataDocument>;
  /**
   * Remove a folder or a node. Absent ⇒ nothing here is deleted by a file
   * gesture, and that is the default a record adapter should keep.
   *
   * The refusal text matters more here than anywhere else in this contract:
   * "deleting a contact is `contacts_delete`" tells a caller where to go,
   * where a bare 405 teaches them to retry. An adapter that DOES implement it
   * owes the same care — a cascade takes children and, for a file space, their
   * bytes, and that has to be visible in the operation's risk level, not just
   * in a comment.
   */
  deleteNode?: (
    ctx: SpaceDataContext,
    input: SpaceDataDeleteInput
  ) => Promise<{ deleted: true }>;
  /** Bulk write for collection views (`contacts.csv`). Opt-in. */
  importCollection?: (
    ctx: SpaceDataContext,
    input: { baseVersion?: string; content: string; path: string }
  ) => Promise<SpaceDataImportResult>;
  /** Human label for the root folder; the caller may translate it. */
  label: string;
  /** `path` is relative to {@link root}; `""` is the root itself. */
  list: (ctx: SpaceDataContext, path: string) => Promise<SpaceDataListing>;
  moduleId: string;
  /**
   * Move and/or rename. Absent ⇒ position in this tree is not the caller's to
   * change.
   *
   * A move here is a TAXONOMY operation, not a byte move — the knowledge base
   * proves the shape: writing `category_id`/`parent_article_id` IS the move,
   * and the returned document carries the new path. This method exists so a
   * caller can perform that move without knowing which field of which record
   * happens to encode containment in this module.
   *
   * Returns the node AT ITS NEW PATH, which is the only way the caller learns
   * where it landed: an adapter is free to slug, disambiguate or re-nest the
   * name it was given.
   */
  moveNode?: (
    ctx: SpaceDataContext,
    input: SpaceDataMoveInput
  ) => Promise<SpaceDataDocument>;
  nodeTypes: readonly SpaceDataNodeType[];
  read: (ctx: SpaceDataContext, path: string) => Promise<SpaceDataDocument>;
  /**
   * The record scopes this adapter can honour. A mount asking for a scope that
   * is not here HIDES the root rather than quietly widening it — contacts and
   * offers carry no `space_id` by design (PLAN-spaces §1b-bis), so a
   * `space`-scoped mount of them has no honest answer but "nothing".
   */
  recordScopes: readonly SpaceDataRecordScope[];
  /** Top-level folder name, e.g. `Contacts`. Unique across adapters. */
  root: string;
  /**
   * The node type of the ROOT folder, so the module can render its own root.
   *
   * The root is a folder like any other and it is the one a module most wants
   * to own — "Contacts" opening on the module's own overview rather than a
   * generic list of two sub-folders. Declared here rather than returned from
   * `list` because nothing lists the root's own row: the roots endpoint
   * produces it, and a type that only appeared once you were already inside
   * the folder would be a type the tree could never use.
   */
  rootNodeType?: string;
  /** Absent ⇒ the whole adapter is read-only. */
  write?: (
    ctx: SpaceDataContext,
    input: SpaceDataWriteInput
  ) => Promise<SpaceDataDocument>;
}

/**
 * 409 — somebody else changed it since you read it.
 *
 * The one error every adapter must be able to raise. An agent recovers by
 * re-reading; a human is told "changed since you opened it". Cheap for us
 * precisely because the database is the store of record — it is the guarantee a
 * file-system-as-database cannot offer at all.
 */
export function dataConflictError(
  message: string,
  details?: Record<string, unknown>
): PluginOperationError {
  return new PluginOperationError("data_conflict", message, {
    status: 409,
    ...(details ? { details } : {}),
  });
}

/**
 * 405 — this module has no such gesture, and the answer names what it does have.
 *
 * The one refusal that must not read as a failure: a tree where every module
 * supports every operation would be a tree that had stopped being a projection
 * of modules. So the message says the module's OWN action ("deleting a contact
 * is `contacts_delete`"), which is the difference between a caller that learns
 * and a caller that retries.
 */
export function notSupportedError(
  message: string,
  details?: Record<string, unknown>
): PluginOperationError {
  return new PluginOperationError("not_supported", message, {
    status: 405,
    ...(details ? { details } : {}),
  });
}

/** 400 — the member named is derived, unknown, or otherwise not writable. */
export function notEditableError(
  message: string,
  details?: Record<string, unknown>
): PluginOperationError {
  return new PluginOperationError("member_not_editable", message, {
    status: 400,
    ...(details ? { details } : {}),
  });
}

/**
 * Folder metadata files, in precedence order.
 *
 * `folder = directory + optional index.md | index.json` (decision 3). When both
 * exist `index.json` wins for structured fields and `index.md`'s body supplies
 * the human description — one shape for a native folder, a local folder, an S3
 * prefix and a mounted Drive folder, which is what makes export/import just
 * writing and reading the tree.
 */
export const SPACE_DATA_INDEX_FILES = ["index.json", "index.md"] as const;

export function isSpaceDataIndexFile(name: string): boolean {
  return (SPACE_DATA_INDEX_FILES as readonly string[]).includes(name);
}

/**
 * Split a tree path into segments, refusing anything that could escape the
 * adapter's root. Traversal is not a hypothetical here: the same paths arrive
 * from an agent's `mastra_workspace_write_file` call.
 */
export function spaceDataPathSegments(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new PluginOperationError(
        "invalid_data_path",
        `path segment "${segment}" is not allowed in a space data path`,
        { status: 400 }
      );
    }
  }
  return segments;
}

/** Normalised path: no leading/trailing slash, no empty or relative segments. */
export function normalizeSpaceDataPath(path: string): string {
  return spaceDataPathSegments(path).join("/");
}

export function joinSpaceDataPath(...parts: string[]): string {
  return normalizeSpaceDataPath(parts.join("/"));
}

/**
 * The node type whose extension a name carries, longest extension first.
 *
 * Longest-first matters: `.contact.md` and `.md` can both be registered, and
 * matching the shorter one would file every contact as a plain note.
 */
export function matchSpaceDataNodeType(
  nodeTypes: readonly SpaceDataNodeType[],
  name: string
): SpaceDataNodeType | null {
  const sorted = [...nodeTypes].sort(
    (a, b) => b.extension.length - a.extension.length
  );
  return sorted.find((type) => name.endsWith(type.extension)) ?? null;
}

/** The member a bundle's node type declares under `name`, or null. */
export function findSpaceDataMemberSpec(
  nodeType: SpaceDataNodeType,
  name: string
): SpaceDataMemberSpec | null {
  return nodeType.members?.find((member) => member.name === name) ?? null;
}

/**
 * Guard the write path: only a declared, non-derived, editable member.
 *
 * Throws rather than returning a boolean because every caller's only sensible
 * response is to refuse, and a boolean invites a caller to forget.
 */
export function assertSpaceDataMemberEditable(
  nodeType: SpaceDataNodeType,
  memberName: string
): SpaceDataMemberSpec {
  const spec = findSpaceDataMemberSpec(nodeType, memberName);
  if (!spec) {
    throw notEditableError(
      `"${memberName}" is not a member of ${nodeType.id}`,
      { member: memberName, nodeType: nodeType.id }
    );
  }
  if (spec.derived || !spec.editable) {
    throw notEditableError(
      spec.derived
        ? `"${memberName}" is a derived render of ${nodeType.id} and cannot be edited — change the record it is rendered from`
        : `"${memberName}" is read-only`,
      { member: memberName, nodeType: nodeType.id }
    );
  }
  return spec;
}

/**
 * Whether two version tokens name the same version.
 *
 * String equality is NOT enough, and the reason is worth stating: the same
 * instant reaches us in two serialisations depending on which path produced it
 * — `2026-08-14T15:57:52.439Z` from a handler that round-tripped a `Date`,
 * `2026-08-14T15:57:52.439+00:00` straight out of PostgREST. Comparing the raw
 * strings makes a client that reuses the version its own write returned collide
 * with itself, and a **spurious 409 is worse than no 409 at all**: it teaches
 * every caller that conflicts are noise to retry through, which is precisely
 * the habit this mechanism exists to prevent.
 *
 * Non-timestamp tokens (an integer version, an etag) compare exactly, so an
 * adapter that does not use `updated_at` is unaffected.
 */
export function spaceDataVersionsMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  // Both sides must LOOK like an ISO-8601 timestamp before either is parsed.
  // `Date.parse` is far too willing — it reads "7" and "07" as dates and would
  // quietly declare an adapter's integer versions equal, turning a conflict
  // check into a coin toss for exactly the adapters that do not use timestamps.
  if (!(ISO_TIMESTAMP.test(a) && ISO_TIMESTAMP.test(b))) {
    return false;
  }
  const left = Date.parse(a);
  const right = Date.parse(b);
  return !(Number.isNaN(left) || Number.isNaN(right)) && left === right;
}

/** `2026-08-14T15:57:52[.439][Z|±hh:mm]` — strict enough to exclude bare numbers. */
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?$/;

/**
 * Did an edited file actually CHANGE this field?
 *
 * The same question as {@link spaceDataVersionsMatch}, asked of every read-only
 * field an adapter shows: a file carrying `updated_at` in one serialisation,
 * compared against a record reporting it in another, looks edited when nobody
 * touched it — and the writer is then refused for a change they did not make.
 * Arrays compare by contents; timestamps by instant; everything else by string,
 * because the file only ever holds text.
 */
export function spaceDataFieldUnchanged(
  before: unknown,
  after: unknown
): boolean {
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before ?? []) === JSON.stringify(after ?? []);
  }
  const left = String(before ?? "");
  const right = String(after ?? "");
  return left === right || spaceDataVersionsMatch(left, right);
}

/**
 * Refuse a write whose base version is not the record's current one.
 *
 * An empty `baseVersion` is refused too. "I did not read it first" is exactly
 * the case last-write-wins hides, and this design exists to stop hiding it.
 */
export function assertSpaceDataVersion(
  currentVersion: string,
  baseVersion: string,
  details?: Record<string, unknown>
): void {
  if (!baseVersion) {
    throw dataConflictError(
      "This write carries no base version — re-read the file and try again.",
      { currentVersion, ...(details ?? {}) }
    );
  }
  if (!spaceDataVersionsMatch(currentVersion, baseVersion)) {
    throw dataConflictError(
      "This has changed since you opened it. Re-read the file and re-apply your edit.",
      { baseVersion, currentVersion, ...(details ?? {}) }
    );
  }
}

/**
 * A record's version token. `updated_at` for every adapter so far; the empty
 * string for a row that carries no timestamp, which the write path then
 * refuses rather than guessing.
 */
export function spaceDataVersionOf(row: {
  updated_at?: string | null;
}): string {
  return row.updated_at ?? "";
}

/* ── Reference files (PLAN-space-data.md D5) ───────────────────────────── */

/**
 * A shortcut to a record, so a generic folder can hold a MIX of things.
 *
 * "Kunde Müller" wants the contact, two offers and some files in one place —
 * but a record must not MOVE there: its home is its module's taxonomy, and
 * moving it between two of those folders is a real update operation. So the
 * folder holds a pointer instead, exactly the trick a `.gdoc` or a `.url` file
 * plays, and the only new bytes this whole plan persists (acceptance 6).
 */
export const SPACE_DATA_REF_EXTENSION = ".ref.json";

export interface SpaceDataRef {
  /** Full tree path of the referent, root segment included. */
  dataPath: string;
  moduleId: string;
  nodeType: string;
  recordId: string;
  /** Label to show; falls back to the file's own name. */
  title?: string;
}

export function isSpaceDataRefName(name: string): boolean {
  return name.endsWith(SPACE_DATA_REF_EXTENSION);
}

/** `Relaunch offer.ref.json` — the readable half is the label. */
export function spaceDataRefFileName(title: string): string {
  return `${title}${SPACE_DATA_REF_EXTENSION}`;
}

/** The label a reference file shows: its name without the extension. */
export function spaceDataRefLabel(fileName: string): string {
  return isSpaceDataRefName(fileName)
    ? fileName.slice(0, -SPACE_DATA_REF_EXTENSION.length)
    : fileName;
}

export function serializeSpaceDataRef(ref: SpaceDataRef): string {
  return `${JSON.stringify(
    {
      dataPath: ref.dataPath,
      moduleId: ref.moduleId,
      nodeType: ref.nodeType,
      recordId: ref.recordId,
      ...(ref.title ? { title: ref.title } : {}),
    },
    null,
    2
  )}\n`;
}

/**
 * Read a reference file, or null when it is not one.
 *
 * Null rather than a throw: a `.ref.json` someone hand-wrote badly should show
 * as an ordinary file in the tree, not break the folder it sits in.
 */
export function parseSpaceDataRef(text: string): SpaceDataRef | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const row = parsed as Record<string, unknown>;
  const required = ["dataPath", "moduleId", "nodeType", "recordId"] as const;
  for (const key of required) {
    if (typeof row[key] !== "string" || !(row[key] as string)) {
      return null;
    }
  }
  return {
    dataPath: row.dataPath as string,
    moduleId: row.moduleId as string,
    nodeType: row.nodeType as string,
    recordId: row.recordId as string,
    ...(typeof row.title === "string" ? { title: row.title } : {}),
  };
}
