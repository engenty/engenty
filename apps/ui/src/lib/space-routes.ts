/**
 * Space URLs (PLAN-spaces.md Phase 5a, Routing).
 *
 * `/s/<spaceKey>/…` — short and human-typable. Deliberately NOT `/mdl/spaces/…`:
 * `/mdl/` is the MODULE prefix and a space is not a module, it is where modules
 * are mounted.
 *
 * One place builds these so a link in the rail, a breadcrumb and an agent-produced
 * ref cannot disagree about the shape.
 */
import {
  isSpaceReservedSegment,
  spaceChatsPathname,
  spaceModuleIdFromUrlSegment,
  spaceModuleUrlSegment,
  spaceRoomPathname,
} from "@engenty/ai-core/browser";

export const SPACE_ROUTE_PREFIX = "/s";

/**
 * `/s/me` — the `~` of this system (PLAN-spaces.md Phase P3).
 *
 * A REDIRECT ALIAS, never a canonical URL. It resolves per viewer, so a link
 * containing it means something different to whoever opens it; leaving it in the
 * address bar would make "copy link and send it to a colleague" quietly point
 * them at their own space instead of the one being discussed. The redirect
 * therefore replaces itself with the real key immediately.
 */
export const PERSONAL_SPACE_ALIAS = "me";

/** The space's own home — its Apps tab. */
export function spaceRootPath(spaceKey: string): string {
  return `${SPACE_ROUTE_PREFIX}/${encodeURIComponent(spaceKey)}`;
}

/**
 * A module mounted inside a space: `/s/<key>/<segment>/<rest>`.
 *
 * The segment is the module's short URL alias where it has one — a space URL is
 * meant to be read and typed, so it is `/s/company/copilot/chat`, not
 * `/s/company/engenty-copilot/chat`. Only the URL changes; the module ID is
 * unchanged everywhere it means something (mounts, manifests, tools).
 */
export function spaceModulePath(
  spaceKey: string,
  moduleId: string,
  rest?: string
): string {
  const base = `${spaceRootPath(spaceKey)}/${encodeURIComponent(
    spaceModuleUrlSegment(moduleId)
  )}`;
  if (!rest) {
    return base;
  }
  return `${base}/${rest.replace(/^\/+/, "")}`;
}

/**
 * A space's settings: `/s/<key>/settings`.
 *
 * Under the SPACE, not under `/settings/spaces/<uuid>`. A space's settings are
 * a property of the place you are standing in, and the URL that names the place
 * is the one you can read, type and send to a colleague — the uuid form could
 * do none of those. It also means leaving a space's settings is one segment
 * back, instead of a jump between two unrelated trees.
 *
 * `settings` cannot collide with a mirrored module route: the mirrors are named
 * after module ids and `settings` is a PLACEMENT, never a module.
 */
export function spaceSettingsPath(spaceKey: string): string {
  return `${spaceRootPath(spaceKey)}/settings`;
}

/** People / members card on space settings — hash so home can land on it. */
export const SPACE_SETTINGS_PEOPLE_HASH = "people";

export function spaceSettingsPeoplePath(spaceKey: string): string {
  return `${spaceSettingsPath(spaceKey)}#${SPACE_SETTINGS_PEOPLE_HASH}`;
}

/**
 * The space's inbox — the shell's notification centre, narrowed to this space:
 * `/s/<key>/notifications`. A reserved segment like `settings`; it belongs to
 * no module, which is why it never depended on one being mounted.
 *
 * The full-screen page is virtually bound to the dashboard: it keeps the
 * Work sidebar and lights the Dashboard row, because the inbox is the home's
 * list, not a place of its own in the column.
 */
export function spaceNotificationsPath(spaceKey: string): string {
  return `${spaceRootPath(spaceKey)}/notifications`;
}

/**
 * Whether this path is a dashboard-bound surface of the space.
 *
 * Today that is the inbox. Those pages keep Work + Dashboard selected rather
 * than sliding to a module column or lighting a different row.
 */
export function isSpaceDashboardBoundPath(
  pathname: string,
  spaceKey: string
): boolean {
  return pathname === spaceNotificationsPath(spaceKey);
}

/**
 * Every conversation held in this space: `/s/<key>/chats`.
 *
 * Under the SPACE, like `data` and `settings`, and for the same reason: it is
 * one view over what SEVERAL modules produced — the copilot's chats, the
 * coordinator's, each specialist's — so no module owns it. `chats` is a
 * reserved segment (`SPACE_RESERVED_SEGMENTS`), which is what stops the shell
 * reading it as a module and hiding the space's own sidebar to show that
 * module's (non-existent) nav.
 */
export function spaceChatsPath(spaceKey: string): string {
  // Delegated, not rebuilt: the copilot module links here too and cannot
  // import this file, so the builder lives beside the reserved segment in
  // ai-core and both readers call the same one.
  return spaceChatsPathname(spaceKey);
}

/**
 * One room of the space: `/s/<key>/rooms/<threadId>`.
 *
 * By thread id, not under an agent: a room is the conversation its agents
 * and people hold, and none of them owns it. Delegated like `chats` — the
 * desk breadcrumb and a chat card in ai-ui link here too.
 */
export function spaceRoomPath(spaceKey: string, threadId: string): string {
  return spaceRoomPathname(spaceKey, threadId);
}

/** The space's agent roster: `/s/<key>/agents`. */
export function spaceAgentsPath(spaceKey: string): string {
  return `${spaceRootPath(spaceKey)}/agents`;
}

/** One mounted agent's Space-native desk. */
export function spaceAgentDeskPath(spaceKey: string, agentId: string): string {
  return `${spaceAgentsPath(spaceKey)}/${encodeURIComponent(agentId)}`;
}

/** Create a new agent already mounted on this space. */
export function spaceAgentHirePath(spaceKey: string): string {
  return `${spaceRootPath(spaceKey)}/agents/new`;
}

/**
 * A space's Data tree: `/s/<key>/data`, with an optional node path.
 *
 * Under the SPACE, like settings, because the tree is the space's own page and
 * not a module's — no single module owns a space's data (PLAN-space-data.md).
 * The node path rides in the query string rather than the path so a node whose
 * own path contains slashes needs no second escaping scheme.
 */
export function spaceDataPath(spaceKey: string, nodePath?: string): string {
  const base = `${spaceRootPath(spaceKey)}/data`;
  return nodePath ? `${base}?path=${encodeURIComponent(nodePath)}` : base;
}

/**
 * A data FOLDER in the tree: `/s/<key>/data?path=<path>&as=folder`.
 *
 * `as=folder` is carried rather than inferred because the pane has to choose
 * between two different endpoints before it has fetched anything — a node is
 * READ, a folder is LISTED — and nothing in a path says which it is. Sniffing
 * the name for an extension would work today only because every node type
 * happens to declare one, and would break the first adapter whose does not.
 *
 * The alternative was to read first and fall back on the error, which costs a
 * round trip on every folder click and only reports cleanly for module roots:
 * a nested folder's failed read is whatever that adapter throws.
 */
export function spaceDataFolderPath(
  spaceKey: string,
  nodePath: string
): string {
  const params = new URLSearchParams({ as: "folder", path: nodePath });
  return `${spaceRootPath(spaceKey)}/data?${params.toString()}`;
}

/**
 * The Artifacts / Ablage root: `/s/<key>/data?as=artifacts`.
 *
 * Artifacts have no data path and no DriveNode that stands for the section —
 * they nest by `parent_id`. This listing is that missing folder: the same
 * children the tree shows under the heading, addressed so the hub can open
 * it like Contacts or Files.
 */
export function spaceDataArtifactsPath(spaceKey: string): string {
  return `${spaceRootPath(spaceKey)}/data?as=artifacts`;
}

/** True when the pane should list the Artifacts root, not one artifact. */
export function isSpaceDataArtifactsListing(search: URLSearchParams): boolean {
  return (
    search.get("as") === "artifacts" &&
    !search.get("artifact") &&
    !search.get("file") &&
    !search.get("folder") &&
    !search.get("path")
  );
}

/**
 * A file-space folder or connector mount: `?folder=<id>&fs=<type>:<id>`.
 *
 * Separate from the data-folder URL because these are not the same object: a
 * data folder is a virtual view over records addressed by path, and this is a
 * real container of bytes addressed by `(owner, folderId)` — the same pair a
 * file needs, and for the same reason (see {@link spaceDataFilePath}).
 */
export function spaceDataFolderInSpacePath(
  spaceKey: string,
  folder: { fileSpaceKey: string; id: string }
): string {
  const params = new URLSearchParams({
    folder: folder.id,
    fs: folder.fileSpaceKey,
  });
  return `${spaceRootPath(spaceKey)}/data?${params.toString()}`;
}

/**
 * A file in the tree: `/s/<key>/data?file=<id>&fs=<type>:<id>&in=<folder>`.
 *
 * The file space rides along because a file id alone does not say which one it
 * is in — the tree reaches into projects' file spaces as well as the space's
 * own, and the same id can exist in both. The folder rides along because
 * `(owner, folderId)` is the only listing that describes a file: there is no
 * fetch-one-file endpoint, and the pane would otherwise have to guess a name.
 */
export function spaceDataFilePath(
  spaceKey: string,
  file: { fileSpaceKey: string; folderId: string | null; id: string }
): string {
  const params = new URLSearchParams({
    file: file.id,
    fs: file.fileSpaceKey,
  });
  if (file.folderId) {
    params.set("in", file.folderId);
  }
  return `${spaceRootPath(spaceKey)}/data?${params.toString()}`;
}

/**
 * A space-scoped artifact in the tree: `/s/<key>/data?artifact=<id>`.
 *
 * In the pane, like everything else the tree holds — an artifact stored to the
 * space is the space's data, and a row that replaces the whole screen is not a
 * tree. The id is enough: artifacts are fetched by id, never by container.
 */
export function spaceDataArtifactPath(
  spaceKey: string,
  artifactId: string,
  options?: { edit?: boolean }
): string {
  const params = new URLSearchParams({ artifact: artifactId });
  if (options?.edit) {
    params.set("edit", "1");
  }
  return `${spaceRootPath(spaceKey)}/data?${params.toString()}`;
}

export interface ParsedSpacePath {
  /** Absent on the space root. */
  moduleId?: string;
  /** Everything after the module id, without a leading slash. */
  rest: string;
  /**
   * The RAW first segment after the space key, reserved segments included.
   *
   * `moduleId` deliberately answers "none" for `settings` and `data`, which is
   * what stops the shell from hiding the space's own sidebar to show a module
   * that does not exist. `notifications` is the same kind of page — the
   * dashboard's inbox. But the space's own pages still have to know WHICH of
   * them is open — the Data tab has to read as active — and that is this field.
   */
  segment?: string;
  spaceKey: string;
}

/** Read `/s/<key>/<module>/<rest>` back apart. Null when it is not a space path. */
export function parseSpacePath(pathname: string): ParsedSpacePath | null {
  const match = pathname.match(/^\/s\/([^/]+)(?:\/([^/]+))?(?:\/(.*))?$/);
  if (!match?.[1]) {
    return null;
  }
  return {
    rest: match[3] ?? "",
    ...(match[2] ? { segment: decodeURIComponent(match[2]) } : {}),
    spaceKey: decodeURIComponent(match[1]),
    // Back to the module ID: callers ask "which module is open", and the answer
    // has to be the id the rest of the system uses, not the URL's short form.
    // A reserved segment answers "none" — `/s/x/settings` is the SPACE's page,
    // and calling it a module makes the shell hide the space's own sidebar to
    // show that module's nav, which does not exist.
    ...(match[2] && !isSpaceReservedSegment(decodeURIComponent(match[2]))
      ? { moduleId: spaceModuleIdFromUrlSegment(decodeURIComponent(match[2])) }
      : {}),
  };
}

/**
 * The `/mdl/<module>/<rest>` shape a legacy deep link uses.
 *
 * Notification links, search hits and agent-produced refs already in flight all
 * use it, so those must REDIRECT rather than 404 — the boring part of Phase 5
 * that bites.
 */
export function parseModulePath(
  pathname: string
): { moduleId: string; rest: string } | null {
  const match = pathname.match(/^\/mdl\/([^/]+)(?:\/(.*))?$/);
  if (!match?.[1]) {
    return null;
  }
  return { moduleId: decodeURIComponent(match[1]), rest: match[2] ?? "" };
}
