/**
 * The space Data tree — a PROJECTION, not a store (PLAN-spaces.md Phase 4,
 * born as "the Drive"; the tab is called Data now and the KB reaches the tree
 * as an ordinary data adapter since Phase K).
 *
 * One tree per space over the stores that already exist: the space's own file
 * space (`module_files`, including its connector mounts), the projects that
 * belong to the space, `ai.artifact`, and every mounted module's data-adapter
 * roots. Nothing here persists anything, and nothing here is a fourth store —
 * §1c says plainly that if a space grows its own storage table, this plan has
 * failed its own test.
 *
 * Pure on purpose. The tree's rules — what a project folder addresses, which
 * node wins a name collision, how the kinds sort — are the part that has to
 * stay true, and they are cheaper to pin here than to chase through a fetch.
 */
import {
  type FileSpaceOwnerRef,
  projectFileSpaceOwner,
  spaceFileSpaceOwner,
} from "./file-space-owner.js";

/**
 * The chip a Drive row wears. `mount` is a folder whose bytes live in a
 * connected external account, and it is a separate kind from `folder` because
 * the difference is the one a reader most needs: those bytes are not ours.
 */
const DRIVE_NODE_KINDS = [
  "folder",
  "project",
  "mount",
  "file",
  "artifact",
  "record",
  "bundle",
] as const;
export type DriveNodeKind = (typeof DRIVE_NODE_KINDS)[number];

export interface DriveNode {
  /** Present on container nodes; absent on leaves. */
  children?: DriveNode[];
  /** Connector connection id, mount nodes only. */
  connectionId?: string;
  /**
   * Path inside the space Data tree, for the kinds a data adapter backs
   * (`record`, `bundle`, and the folders inside an adapter's root). Includes
   * the adapter's root segment, so it is the exact string the data endpoints
   * take — PLAN-space-data.md D1.
   */
  dataPath?: string;
  /**
   * The folder a `file` node sits in; null at the file space's root.
   *
   * Part of a file's address, not decoration: `(owner, folderId)` is the pair
   * that lists it, and the detail pane re-uses that listing — already fetched,
   * already cached — rather than the single-file endpoint that does not exist.
   */
  folderId?: string | null;
  /** True while this container's children have not been fetched yet. */
  hasChildren?: boolean;
  /**
   * Where this node opens in the app, for the kinds that live in a module.
   *
   * Built by the CALLER and carried through, so this projection stays free of
   * route knowledge: a project's home is the projects module and an artifact's
   * is the AI service, and neither URL is this package's to know. Absent on
   * nodes the Data pane shows itself (records, files).
   */
  href?: string;
  /** Stable within one tree; `${kind}:${sourceId}`. */
  id: string;
  /**
   * A SHORTCUT to a record (`<name>.ref.json`), not the record itself.
   *
   * The bytes live in the file space; the thing they point at lives in its
   * module. That indirection is the whole point (PLAN-space-data.md D5): a
   * "Kunde Müller" folder can hold the contact, two offers and some files
   * without any record MOVING out of its module's taxonomy, because moving one
   * between taxonomy folders is a real update operation and a mixed folder is
   * not a taxonomy.
   */
  isReference?: boolean;
  kind: DriveNodeKind;
  /** MIME type of a `file` node, as `module_files` recorded it. */
  mimeType?: string;
  /** The module a `record`/`bundle` node belongs to. */
  moduleId?: string;
  name: string;
  /**
   * The node type of a typed `folder`, as its adapter declared it.
   *
   * Only folders carry it: a record's type is already implied by the members
   * its read returns, but a folder is never read — it is listed — so the type
   * has to travel on the row or the pane has nothing to key a renderer on.
   */
  nodeType?: string;
  /**
   * The file space this node addresses.
   *
   * On a `project` it is that project's own file space — the field that makes
   * the Drive's project folder and the project's Files tab the SAME object. On
   * a `folder`, `mount` or `file` it is the file space the node LIVES IN, which
   * is what lets the tree open a folder without knowing how deep it sits or
   * whose file space it drifted in from: the child fetch needs the pair
   * (owner, folderId) and both travel on the node.
   */
  owner?: FileSpaceOwnerRef;
  /** Size in bytes of a `file` node. */
  sizeBytes?: number;
  /** Opaque id in the node's own store, for the renderer to route on. */
  sourceId: string;
  updatedAt?: string;
  /** Optimistic-concurrency token for `record`/`bundle` nodes. */
  version?: string;
  /**
   * Whatever a module's own renderer needs to render this node, carried
   * opaquely.
   *
   * An artifact will need something its own module knows about. Naming each of
   * them here would put every module's vocabulary into a package that is
   * supposed to know none of it, and the value goes straight through to the
   * contributed view's `params` — the same bag that surface already takes.
   */
  viewParams?: Record<string, string>;
}

export interface SpaceDriveArtifact {
  href?: string;
  id: string;
  /** Folder containment; null/omitted is the Artifacts root. */
  parentId?: string | null;
  title: string;
  /** `ai.artifact.type` — markdown uses the page icon; folder nests children. */
  type?: string;
  updatedAt?: string;
}

export interface SpaceDriveProject {
  href?: string;
  id: string;
  title: string;
  updatedAt?: string;
}

export interface SpaceDriveFolder {
  connectionId?: string | undefined;
  createdAt?: string;
  id: string;
  name: string;
  /** null = the file space's root. */
  parentId: string | null;
  readOnly?: boolean;
  /** `native` or a connector kind; anything else is a mount. */
  source?: string;
  updatedAt?: string;
}

export interface SpaceDriveFile {
  createdAt?: string;
  /** null = the file space's root. */
  folderId: string | null;
  id: string;
  mimeType?: string;
  name: string;
  readOnly?: boolean;
  sizeBytes?: number;
  updatedAt?: string;
}

/** One module's root folder in the Data tree (PLAN-space-data.md D2). */
export interface SpaceDriveDataRoot {
  label: string;
  moduleId: string;
  root: string;
  /** The adapter's own type for its root folder, where it declared one. */
  rootNodeType?: string;
}

/** One row of a data adapter's listing, as the tree needs it. */
export interface SpaceDriveDataEntry {
  kind: "bundle" | "record";
  mimeType?: string;
  name: string;
  /** FULL tree path, root segment included — as the server returns it. */
  path: string;
  recordId: string;
  sizeBytes?: number;
  /** What a reader should see; the `name` is the file. */
  title?: string;
  updatedAt?: string;
  version: string;
}

export interface SpaceDriveDataFolder {
  /** Connector connection behind a mounted folder. */
  connectionId?: string;
  name: string;
  /** The adapter's own type for this folder, where it declared one. */
  nodeType?: string;
  /** FULL tree path, root segment included — as the server returns it. */
  path: string;
}

export interface SpaceDriveInput {
  /** Space-scoped artifacts (`ai.artifact` with scope_type 'space'). */
  artifacts?: readonly SpaceDriveArtifact[];
  /**
   * Module roots contributed by data adapters, already mount-filtered.
   *
   * The space's own file space is one of these since P1.3 — it has no separate
   * input here, because it is no longer a separate lane.
   */
  dataRoots?: readonly SpaceDriveDataRoot[];
  /** Projects whose `space_id` is this space. */
  projects?: readonly SpaceDriveProject[];
  /** Label for the synthetic Projects folder; the caller translates it. */
  projectsFolderLabel?: string;
  spaceId: string;
}

/** Sort order within a level: containers first, then leaves, each by name. */
const KIND_RANK: Record<DriveNodeKind, number> = {
  artifact: 7,
  // A bundle is a container that READS as one item, so it sorts with the
  // containers rather than among the files it is made of.
  bundle: 3,
  file: 4,
  folder: 1,
  mount: 2,
  project: 0,
  record: 5,
};

function byKindThenName(a: DriveNode, b: DriveNode): number {
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  return rank === 0 ? a.name.localeCompare(b.name) : rank;
}

/** A folder is a mount when its bytes come from a connected external account. */
function isMount(folder: SpaceDriveFolder): boolean {
  return Boolean(
    folder.connectionId || (folder.source && folder.source !== "native")
  );
}

/**
 * A folder in a file space, as a node.
 *
 * `hasChildren` is asserted, not measured: a listing names a folder without
 * saying what is in it, and the alternative — counting every folder's contents
 * to decide whether to draw a triangle — is the eager walk this projection
 * exists not to be. An empty folder therefore opens and says it is empty, which
 * is the honest outcome of a question that could only be answered by asking.
 */
function folderNode(
  folder: SpaceDriveFolder,
  owner: FileSpaceOwnerRef
): DriveNode {
  const mount = isMount(folder);
  return {
    hasChildren: true,
    id: `${mount ? "mount" : "folder"}:${folder.id}`,
    kind: mount ? "mount" : "folder",
    name: folder.name,
    owner,
    sourceId: folder.id,
    ...(folder.connectionId ? { connectionId: folder.connectionId } : {}),
    ...(folder.updatedAt ? { updatedAt: folder.updatedAt } : {}),
  };
}

/** The extension a reference file carries; mirrors the plugin SDK's constant. */
const REFERENCE_EXTENSION = ".ref.json";

/**
 * A file in the space's own file space, as a node.
 *
 * A `<name>.ref.json` is rendered as a RECORD, not as the JSON file it
 * physically is — the reader clicked a shortcut to a contact and should see a
 * contact. The bytes are still there for anything that walks the file space;
 * this is presentation, and `isReference` is how the renderer knows the click
 * needs resolving first.
 */
function fileNode(file: SpaceDriveFile, owner: FileSpaceOwnerRef): DriveNode {
  const isReference = file.name.endsWith(REFERENCE_EXTENSION);
  return {
    folderId: file.folderId ?? null,
    id: `file:${file.id}`,
    kind: isReference ? "record" : "file",
    name: isReference
      ? file.name.slice(0, -REFERENCE_EXTENSION.length)
      : file.name,
    owner,
    sourceId: file.id,
    ...(isReference ? { isReference: true } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(typeof file.sizeBytes === "number"
      ? { sizeBytes: file.sizeBytes }
      : {}),
    ...(file.updatedAt ? { updatedAt: file.updatedAt } : {}),
  };
}

/**
 * One level inside a file space, as tree nodes.
 *
 * The same two shapes the root level is built from, so a folder opened three
 * levels down renders exactly like the root and carries the same owner — the
 * tree has one rule for "what is in here", not one for the top and another for
 * everything below it.
 */
export function spaceFolderChildNodes(input: {
  files?: readonly SpaceDriveFile[];
  folders?: readonly SpaceDriveFolder[];
  owner: FileSpaceOwnerRef;
}): DriveNode[] {
  return [
    ...(input.folders ?? []).map((folder) => folderNode(folder, input.owner)),
    ...(input.files ?? []).map((file) => fileNode(file, input.owner)),
  ].sort(byKindThenName);
}

/**
 * The `Projects/` level: one folder per project, each addressing that project's
 * file space through {@link projectFileSpaceOwner} — the SAME call the project's
 * Files tab makes, which is what stops the two renderings from drifting apart.
 */
export function spaceDriveProjectNodes(
  projects: readonly SpaceDriveProject[]
): DriveNode[] {
  return projects
    .map((project) => ({
      // A project opens into its own file space, one fetch away — the same
      // listing its Files tab shows, which is the point of addressing it
      // through `projectFileSpaceOwner` rather than copying files up here.
      hasChildren: true,
      id: `project:${project.id}`,
      kind: "project" as const,
      name: project.title,
      owner: projectFileSpaceOwner(project.id),
      sourceId: project.id,
      ...(project.href ? { href: project.href } : {}),
      ...(project.updatedAt ? { updatedAt: project.updatedAt } : {}),
    }))
    .sort(byKindThenName);
}

/**
 * The space's Drive, top level.
 *
 * Only the root is materialised: a folder's contents are fetched when it is
 * opened, because a Drive that loaded every project's file space to render its
 * first screen would be a store pretending to be a view.
 */
/**
 * A module's root folder, as a tree node.
 *
 * `hasChildren` without `children` is the lazy contract: the tree draws a
 * disclosure triangle and fetches on open. Eagerly loading every module's
 * records to render the first screen is exactly the "store pretending to be a
 * view" this projection exists not to be.
 */
export function spaceDataRootNodes(
  roots: readonly SpaceDriveDataRoot[]
): DriveNode[] {
  return roots
    .map((entry) => ({
      dataPath: entry.root,
      hasChildren: true,
      id: `data:${entry.moduleId}`,
      kind: "folder" as const,
      moduleId: entry.moduleId,
      name: entry.label,
      sourceId: entry.moduleId,
      ...(entry.rootNodeType ? { nodeType: entry.rootNodeType } : {}),
    }))
    .sort(byKindThenName);
}

/**
 * One level inside a data adapter, as tree nodes.
 *
 * Paths are taken AS GIVEN. The server roots every path it returns on the
 * adapter's root before it leaves the HTTP boundary, so a node's `dataPath` is
 * already the exact string the data endpoints take. Re-joining it here is how
 * `Contacts/People` once became `Contacts/People/People/anna.md` — and how a
 * save from the detail pane once 404'd on a folder called `draft`.
 */
/**
 * `index.md`, `index.json`, `index.article.md` — a folder's own record.
 *
 * Any `index.*`, not a fixed list: the rule is "a folder is a directory plus an
 * index" and an adapter names its index for its own node type, so a list here
 * would have to be extended by every adapter that grows one.
 */
function isFolderIndexName(name: string): boolean {
  return name.startsWith("index.");
}

export function spaceDataChildNodes(input: {
  entries?: readonly SpaceDriveDataEntry[];
  folders?: readonly SpaceDriveDataFolder[];
  moduleId: string;
  parentPath: string;
}): DriveNode[] {
  const nodes: DriveNode[] = [];
  for (const folder of input.folders ?? []) {
    nodes.push({
      dataPath: folder.path,
      hasChildren: true,
      id: `data:${input.moduleId}:${folder.path}`,
      kind: "folder",
      moduleId: input.moduleId,
      name: folder.name,
      sourceId: folder.path,
      ...(folder.nodeType ? { nodeType: folder.nodeType } : {}),
      ...(folder.connectionId ? { connectionId: folder.connectionId } : {}),
    });
  }
  for (const entry of input.entries ?? []) {
    if (isFolderIndexName(entry.name)) {
      // A folder's index IS the folder (decision 3): the row above already
      // stands for this record and opening it shows exactly this text, so
      // listing it again puts the same page inside itself. Hidden in the TREE
      // only — the listing still carries it, because the file face has no
      // folder row to click and must be able to read a folder's own text.
      continue;
    }
    nodes.push({
      dataPath: entry.path,
      id: `${entry.kind}:${input.moduleId}:${entry.recordId}`,
      kind: entry.kind,
      moduleId: input.moduleId,
      // The title where the adapter gave one: a tree row reading
      // `sicherheit-an-bord__019fea70-….article.md` is showing the reader a
      // path segment, not a page.
      name: entry.title || entry.name,
      sourceId: entry.recordId,
      ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      ...(entry.version ? { version: entry.version } : {}),
      ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
      ...(typeof entry.sizeBytes === "number"
        ? { sizeBytes: entry.sizeBytes }
        : {}),
    });
  }
  return nodes.sort(byKindThenName);
}

export function buildSpaceDrive(input: SpaceDriveInput): DriveNode[] {
  const nodes: DriveNode[] = [];

  nodes.push(...spaceDataRootNodes(input.dataRoots ?? []));

  const projects = input.projects ?? [];
  if (projects.length > 0) {
    nodes.push({
      children: spaceDriveProjectNodes(projects),
      // Synthetic: there is no `Projects` row anywhere. A project is an episode
      // inside the space, and this folder is how the steady tier shows them
      // without the projects module needing to know the Drive exists.
      id: "folder:projects",
      kind: "folder",
      name: input.projectsFolderLabel ?? "Projects",
      sourceId: "projects",
    });
  }

  // The space's own file space is NOT assembled here any more. It arrives as
  // the `files` module's data-adapter root, already mount-filtered by the
  // server — which is what makes mount = grant true of it for the first time
  // (PLAN-space-data-agent-crud P1.3, decision 1). Reading it here as well
  // would show every folder twice AND keep an ungated lane alive beside the
  // gated one, which is the fallback this repo forbids.
  nodes.push(...spaceDriveArtifactNodes(input.artifacts ?? []));

  return nodes.sort(byKindThenName);
}

/**
 * Mixed artifact types (markdown pages, html, tables, apps, folders) as one
 * tree. `parent_id` nests folder children; orphans (missing parent) sit at
 * the Artifacts root.
 */
function spaceDriveArtifactNodes(
  artifacts: readonly SpaceDriveArtifact[]
): DriveNode[] {
  const ids = new Set(artifacts.map((artifact) => artifact.id));
  const byParent = new Map<string | null, SpaceDriveArtifact[]>();
  for (const artifact of artifacts) {
    const parentId =
      artifact.parentId && ids.has(artifact.parentId)
        ? artifact.parentId
        : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(artifact);
    byParent.set(parentId, siblings);
  }
  const nodesFor = (parentId: string | null): DriveNode[] =>
    (byParent.get(parentId) ?? [])
      .map((artifact) => artifactNode(artifact, nodesFor(artifact.id)))
      .sort(byKindThenName);
  return nodesFor(null);
}

function artifactNode(
  artifact: SpaceDriveArtifact,
  children: DriveNode[]
): DriveNode {
  const isFolder = artifact.type === "folder";
  return {
    id: `${isFolder ? "folder" : "artifact"}:${artifact.id}`,
    kind: isFolder ? "folder" : "artifact",
    name: artifact.title,
    nodeType: artifact.type ?? "markdown",
    sourceId: artifact.id,
    ...(artifact.href ? { href: artifact.href } : {}),
    ...(artifact.updatedAt ? { updatedAt: artifact.updatedAt } : {}),
    ...(isFolder ? { children, hasChildren: true } : {}),
  };
}

/** The file space the Drive's root level browses: the space's own. */
export function spaceDriveRootOwner(spaceId: string): FileSpaceOwnerRef {
  return spaceFileSpaceOwner(spaceId);
}
