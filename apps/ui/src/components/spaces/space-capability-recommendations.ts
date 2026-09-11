/**
 * Which skills and connections belong with the modules the user chose.
 *
 * Module skills stamp `engenty_modules` at seed time; name prefixes cover
 * custom skills that never got the tag (`kb-*` for Knowledge Base). File
 * connectors (Drive, local folder, OneDrive, S3) belong with Knowledge Base
 * — not every connector in the tenant, and not Gmail just because a KB is on.
 *
 * A live ranking call can replace the maps later; the wizard must not wait
 * on one to show a list.
 *
 * Module skills are mounted with their app — the picker never asks for them.
 */
import { type SpaceSelection, toggleSelection } from "./space-setup-selection";

export const FILE_CONNECTOR_IDS = new Set([
  "google-drive",
  "local-files",
  "microsoft-onedrive",
  "s3",
]);

export const FILE_SPACE_MODULES = new Set(["files", "knowledge-base"]);

/**
 * Baseline modules (Files, Plan, …) stay mounted for every space. Matching
 * against them would recommend Drive on a space that only added Inbox.
 * Capabilities follow the apps the user actually chose.
 */
export function capabilityModuleIds(
  selection: Iterable<{ resourceKey: string; resourceType: string }>,
  lockedKeys: ReadonlySet<string>
): Set<string> {
  const ids = mountedModuleIds(selection);
  for (const key of lockedKeys) {
    if (key.startsWith("module:")) {
      ids.delete(key.slice("module:".length));
    }
  }
  return ids;
}

const MODULE_SKILL_PREFIXES: Record<string, readonly string[]> = {
  contacts: ["contacts"],
  files: ["files"],
  inbox: ["inbox"],
  invoices: ["invoices"],
  "knowledge-base": ["knowledge-base", "kb"],
  offers: ["offers"],
  projects: ["projects"],
  tasks: ["tasks"],
  team: ["team"],
  "team-chat": ["team-chat"],
};

const INBOX_CONNECTOR_HINTS = [
  "gmail",
  "mail",
  "outlook",
  "imap",
  "smtp",
  "microsoft-mail",
];

export interface CapabilitySkill {
  id: string;
  modules?: readonly string[] | null;
  source?: string | null;
}

export interface CapabilityConnection {
  connectorId?: string | null;
  hasFiles?: boolean;
  id: string;
  name: string;
}

export function mountedModuleIds(
  selection: Iterable<{ resourceKey: string; resourceType: string }>
): Set<string> {
  return new Set(
    [...selection]
      .filter((entry) => entry.resourceType === "module")
      .map((entry) => entry.resourceKey)
  );
}

function skillMatchesModule(skill: CapabilitySkill, moduleId: string): boolean {
  if (skill.modules?.includes(moduleId)) {
    return true;
  }
  const prefixes = MODULE_SKILL_PREFIXES[moduleId] ?? [moduleId];
  const id = skill.id.toLocaleLowerCase();
  return prefixes.some(
    (prefix) =>
      id === prefix ||
      id.startsWith(`${prefix}-`) ||
      id.startsWith(`${prefix}.`)
  );
}

export function relatedSkillIds(
  moduleIds: ReadonlySet<string>,
  skills: readonly CapabilitySkill[]
): Set<string> {
  const ids = new Set<string>();
  for (const skill of skills) {
    for (const moduleId of moduleIds) {
      if (skillMatchesModule(skill, moduleId)) {
        ids.add(skill.id);
        break;
      }
    }
  }
  return ids;
}

/**
 * Modules this skill ships with — catalog ids, prefix maps, and frontmatter
 * tags. Empty means a custom skill the picker may still offer.
 */
export function owningModuleIdsForSkill(
  skill: CapabilitySkill,
  knownModuleIds: ReadonlySet<string>
): string[] {
  const candidates = new Set([
    ...knownModuleIds,
    ...Object.keys(MODULE_SKILL_PREFIXES),
    ...(skill.modules ?? []),
  ]);
  return [...candidates].filter((moduleId) =>
    skillMatchesModule(skill, moduleId)
  );
}

export function isModuleSkill(
  skill: CapabilitySkill,
  knownModuleIds: ReadonlySet<string>
): boolean {
  if (skill.source === "library" || skill.source === "builtin") {
    return false;
  }
  return owningModuleIdsForSkill(skill, knownModuleIds).length > 0;
}

/**
 * Module skills follow the app, the way bundled agents do. Custom skills are
 * left for the Capabilities picker.
 */
export function syncSpaceSkills(
  selection: SpaceSelection,
  skills: readonly CapabilitySkill[],
  knownModuleIds: ReadonlySet<string>
): SpaceSelection {
  const mountedModules = mountedModuleIds(selection.values());
  let next = selection;
  for (const skill of skills) {
    const owners = owningModuleIdsForSkill(skill, knownModuleIds);
    if (owners.length === 0) {
      continue;
    }
    const shouldMount = owners.some((moduleId) => mountedModules.has(moduleId));
    const inSelection = next.has(`skill:${skill.id}`);
    if (shouldMount === inSelection) {
      continue;
    }
    next = toggleSelection(
      next,
      { resourceKey: skill.id, resourceType: "skill" },
      shouldMount
    );
  }
  return next;
}

function connectionMatchesModules(
  connection: CapabilityConnection,
  moduleIds: ReadonlySet<string>
): boolean {
  if (
    [...FILE_SPACE_MODULES].some((moduleId) => moduleIds.has(moduleId)) &&
    (connection.hasFiles ||
      FILE_CONNECTOR_IDS.has(connection.connectorId ?? ""))
  ) {
    return true;
  }
  if (!moduleIds.has("inbox")) {
    return false;
  }
  const haystack =
    `${connection.connectorId ?? ""} ${connection.name}`.toLocaleLowerCase();
  return INBOX_CONNECTOR_HINTS.some((hint) => haystack.includes(hint));
}

export function relatedConnectionIds(
  moduleIds: ReadonlySet<string>,
  connections: readonly CapabilityConnection[]
): Set<string> {
  return new Set(
    connections
      .filter((connection) => connectionMatchesModules(connection, moduleIds))
      .map((connection) => connection.id)
  );
}
