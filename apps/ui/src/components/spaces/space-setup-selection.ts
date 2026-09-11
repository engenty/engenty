/**
 * The setup dialog's selection model (PLAN-spaces.md Phase 3b).
 *
 * Kept out of the component so the rules that decide what gets written — which
 * boxes are locked, what a newly checked module grants, which mounts a save
 * would remove — can be tested without rendering anything. The dialog is the
 * authoring surface for capability grants; "it looked right on screen" is not
 * the standard those rules deserve.
 */
import {
  type SpaceMountDeclaration,
  type SpaceResourceKind,
  spaceMountKey,
} from "@engenty/ui-plugin-sdk";

export type SpaceAccessLevel = "none" | "read" | "write";

export interface SpaceSelectionEntry {
  /** Module-only; ignored for the other kinds. */
  agentAccess?: SpaceAccessLevel;
  resourceKey: string;
  resourceType: SpaceResourceKind;
}

/** Selection state, keyed the way the mount table keys a row. */
export type SpaceSelection = Map<string, SpaceSelectionEntry>;

/**
 * What a module a human just added grants its engentys.
 *
 * Adding a module means the space should be able to work with it, including
 * its engentys. `none` would put the app in the space and leave agents blind.
 * `read` is the tighter choice (look up, don't change) and lives on Details.
 *
 * The SERVER still defaults an unspecified `agent_access` to `none`
 * (`normalizeDesiredMount`), and that difference is deliberate: a payload that
 * omits the field made no choice, and an absent choice must not grant.
 */
export const DEFAULT_MODULE_ACCESS: SpaceAccessLevel = "write";

/**
 * A mount kind that carries an engenty access level
 * (PLAN-connections-ux.md B1/C1).
 *
 * Modules and accounts both do; agents and skills are availability only. The
 * account's own `autonomous_mode` stays the owner's ceiling — the level here is
 * what THIS space grants, and the server raises the ceiling to match.
 */
export function carriesAccessLevel(kind: SpaceResourceKind): boolean {
  return kind === "module" || kind === "connection";
}

export function selectionFromMounts(
  mounts: readonly {
    agentAccess: SpaceAccessLevel | null;
    resourceKey: string;
    resourceType: SpaceResourceKind;
  }[]
): SpaceSelection {
  const selection: SpaceSelection = new Map();
  for (const mount of mounts) {
    selection.set(spaceMountKey(mount), {
      resourceKey: mount.resourceKey,
      resourceType: mount.resourceType,
      // A module always stores a level (`none` when nobody chose). An account
      // may have none yet — null there means "this space has not decided", and
      // flattening it to `none` would claim a decision nobody made.
      ...(mount.resourceType === "module"
        ? { agentAccess: mount.agentAccess ?? "none" }
        : mount.resourceType === "connection" && mount.agentAccess
          ? { agentAccess: mount.agentAccess }
          : {}),
    });
  }
  return selection;
}

export function selectionFromDeclarations(
  mounts: readonly SpaceMountDeclaration[]
): SpaceSelection {
  const selection: SpaceSelection = new Map();
  for (const mount of mounts) {
    selection.set(spaceMountKey(mount), {
      resourceKey: mount.resourceKey,
      resourceType: mount.resourceType,
      ...(mount.resourceType === "module"
        ? { agentAccess: mount.agentAccess ?? DEFAULT_MODULE_ACCESS }
        : {}),
    });
  }
  return selection;
}

export function toggleSelection(
  selection: SpaceSelection,
  entry: { resourceKey: string; resourceType: SpaceResourceKind },
  checked: boolean
): SpaceSelection {
  const next = new Map(selection);
  const key = spaceMountKey(entry);
  if (!checked) {
    next.delete(key);
    return next;
  }
  next.set(key, {
    resourceKey: entry.resourceKey,
    resourceType: entry.resourceType,
    // Adding an account means this space should be able to work with it, same
    // reasoning as a module: `none` would place it here and leave engentys
    // blind, which is the state this whole flow exists to stop producing.
    ...(carriesAccessLevel(entry.resourceType)
      ? { agentAccess: DEFAULT_MODULE_ACCESS }
      : {}),
  });
  return next;
}

/** Module id → the module ids it requires, read off the catalog rows. */
export type ModuleRequires = ReadonlyMap<string, readonly string[]>;

export function moduleRequiresFromItems(
  items: readonly { id: string; requires?: string[] }[]
): ModuleRequires {
  const map = new Map<string, string[]>();
  for (const item of items) {
    if (item.requires && item.requires.length > 0) {
      map.set(item.id, item.requires);
    }
  }
  return map;
}

function moduleKey(moduleId: string): string {
  return spaceMountKey({ resourceKey: moduleId, resourceType: "module" });
}

/**
 * Modules in the selection that require `moduleId` — the reason it cannot be
 * removed while they stay. Names the DIRECT dependents only; the picker shows
 * them, and removing those first unlocks this one.
 */
export function moduleRequiredBy(
  selection: SpaceSelection,
  moduleId: string,
  requires: ModuleRequires
): string[] {
  const dependents: string[] = [];
  for (const entry of selection.values()) {
    if (entry.resourceType !== "module" || entry.resourceKey === moduleId) {
      continue;
    }
    if ((requires.get(entry.resourceKey) ?? []).includes(moduleId)) {
      dependents.push(entry.resourceKey);
    }
  }
  return dependents;
}

/**
 * Add every module a selected module requires, transitively. Idempotent; a
 * closed set comes back as is.
 */
export function closeModuleDependencies(
  selection: SpaceSelection,
  requires: ModuleRequires
): SpaceSelection {
  let next = selection;
  const queue = [...selection.values()]
    .filter((entry) => entry.resourceType === "module")
    .map((entry) => entry.resourceKey);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const moduleId = queue.shift() as string;
    for (const required of requires.get(moduleId) ?? []) {
      if (!next.has(moduleKey(required))) {
        next = toggleSelection(
          next,
          { resourceKey: required, resourceType: "module" },
          true
        );
      }
      if (!seen.has(required)) {
        seen.add(required);
        queue.push(required);
      }
    }
  }
  return next;
}

/**
 * Tick or untick a module WITH its dependencies: adding pulls in what it
 * requires, removing takes out what requires it. Both transitive, so the
 * selection never holds a module whose dependency is missing.
 */
export function toggleModuleSelection(
  selection: SpaceSelection,
  moduleId: string,
  checked: boolean,
  requires: ModuleRequires
): SpaceSelection {
  if (checked) {
    return closeModuleDependencies(
      toggleSelection(
        selection,
        { resourceKey: moduleId, resourceType: "module" },
        true
      ),
      requires
    );
  }
  let next = selection;
  const queue = [moduleId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dependent of moduleRequiredBy(next, current, requires)) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push(dependent);
      }
    }
    next = toggleSelection(
      next,
      { resourceKey: current, resourceType: "module" },
      false
    );
  }
  return next;
}

export function toggleSkillPack(
  selection: SpaceSelection,
  skillIds: readonly string[],
  checked: boolean
): SpaceSelection {
  let next = selection;
  for (const id of skillIds) {
    next = toggleSelection(
      next,
      { resourceKey: id, resourceType: "skill" },
      checked
    );
  }
  return next;
}

export function skillPackFullySelected(
  selection: SpaceSelection,
  skillIds: readonly string[]
): boolean {
  return (
    skillIds.length > 0 &&
    skillIds.every((id) =>
      selection.has(spaceMountKey({ resourceKey: id, resourceType: "skill" }))
    )
  );
}

export function setModuleAccess(
  selection: SpaceSelection,
  moduleId: string,
  agentAccess: SpaceAccessLevel
): SpaceSelection {
  return setMountAccess(
    selection,
    { resourceKey: moduleId, resourceType: "module" },
    agentAccess
  );
}

/** The same edit for an account (PLAN-connections-ux.md C1). */
export function setMountAccess(
  selection: SpaceSelection,
  entry: { resourceKey: string; resourceType: SpaceResourceKind },
  agentAccess: SpaceAccessLevel
): SpaceSelection {
  const key = spaceMountKey(entry);
  const current = selection.get(key);
  if (!current) {
    return selection;
  }
  const next = new Map(selection);
  next.set(key, { ...current, agentAccess });
  return next;
}

/**
 * Mounts a save would remove — the sentence the edit dialog has to say out loud
 * before it says it, because unmounting HIDES records and never deletes them,
 * and nobody reads that reassurance after the fact.
 */
export function pendingRemovals(
  selection: SpaceSelection,
  existing: readonly { resourceKey: string; resourceType: SpaceResourceKind }[]
): Array<{ resourceKey: string; resourceType: SpaceResourceKind }> {
  return existing.filter((mount) => !selection.has(spaceMountKey(mount)));
}

/**
 * The payload shape the create and edit endpoints both take.
 *
 * `record_scope` is deliberately absent. This used to send `"space"` for every
 * module, which is false for the modules people actually mount — contacts,
 * invoices and offers are one tenant-wide book a space borrows, not a per-space
 * set — and it was a claim no reader had asked for. The column stays for the
 * one thing it could honestly mean later (a per-space VIEW over global records)
 * and stays unwritten until that exists.
 */
export function selectionToPayload(selection: SpaceSelection): Array<{
  agent_access?: SpaceAccessLevel;
  resource_key: string;
  resource_type: SpaceResourceKind;
}> {
  return [...selection.values()].map((entry) => ({
    resource_key: entry.resourceKey,
    resource_type: entry.resourceType,
    // An account posts its level only when this space has one. Sending a
    // default would decide for a space that never did — and the server reads
    // an absent level as "fall back to the account's own setting".
    ...(entry.resourceType === "module"
      ? { agent_access: entry.agentAccess ?? DEFAULT_MODULE_ACCESS }
      : entry.resourceType === "connection" && entry.agentAccess
        ? { agent_access: entry.agentAccess }
        : {}),
  }));
}

/** `Kunde Müller GmbH` → `kunde-mueller-gmbh`, matching `spaces_key_format_check`. */
export function spaceKeyFromName(name: string): string {
  const folded = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
}
