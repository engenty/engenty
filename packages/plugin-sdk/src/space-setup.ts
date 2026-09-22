/**
 * Space setup declarations (PLAN-spaces.md Phase 3b).
 *
 * The setup dialog and the DAL that persists what it produces must agree on two
 * things: which mounts a space cannot exist without, and what each template
 * preselects. Both live here, in plugin-sdk, for the same reason
 * {@link deriveSpaceAgentCapabilities} does — a rule the UI and the server each
 * kept their own copy of is a rule that drifts, and the checklist explicitly
 * demands the baseline be enforced in the DAL *too*, not only in the dialog.
 *
 * These are declarations, not a catalog. What is actually installable in a
 * tenant comes from the plugin registry, the agent registry and the skill
 * library; a template recommends resources that the wizard intersects with
 * what the tenant really has.
 */
import type { SpaceAgentAccessLevel } from "./space-grants.js";

export const SPACE_RESOURCE_KINDS = [
  "module",
  "agent",
  "skill",
  "connection",
  "plugin",
] as const;
export type SpaceResourceKind = (typeof SPACE_RESOURCE_KINDS)[number];

/**
 * Reserved: per-space narrowing of a mounted module's records.
 *
 * Nothing writes this and nothing reads it. Records never move — contacts,
 * invoices and offers are one tenant-wide book that a space borrows, and their
 * tables have no `space_id` to scope by — so the only meaningful use left is a
 * per-space VIEW over a global set (module objects as virtual folders in the
 * data tree), which is not designed yet. Until it is, a mount says nothing
 * here rather than inventing a decision for the future reader to trust.
 */
export type SpaceRecordScopeLevel = "space" | "all";

export interface SpaceMountDeclaration {
  /** Module-only. Absent on a module mount means `none` — grant nothing. */
  agentAccess?: SpaceAgentAccessLevel;
  /** Module-only, and left unset — see {@link SpaceRecordScopeLevel}. */
  recordScope?: SpaceRecordScopeLevel;
  resourceKey: string;
  resourceType: SpaceResourceKind;
}

/** Stable identity of a mount within a space; the table's PK minus tenant/space. */
export function spaceMountKey(
  mount: Pick<SpaceMountDeclaration, "resourceKey" | "resourceType">
): string {
  return `${mount.resourceType}:${mount.resourceKey}`;
}

/**
 * The mounts every space has, and cannot lose.
 *
 * "A space with no chat is a broken space" — so rather than validating that
 * afterwards, these are seeded by the database for every space however it is
 * created (including the trigger-made Company and personal ones), marked
 * `is_required`, hidden from the wizard picker (they are added, not chosen),
 * and refused by the removal path.
 *
 * Planning is NOT baseline. Tasks is a module a space chooses — the wizard
 * features it on purpose templates — but a space that only chats and keeps
 * files is a complete space. The first Company space is baseline only.
 *
 * MIRRORED IN SQL: `core.space_baseline_mounts()` — the latest migration that
 * redefines it. `space-setup.test.ts` / `space-baseline-sql-pin.test.ts` read
 * that function and fail if the two lists disagree.
 */
export const SPACE_BASELINE_MOUNTS: readonly SpaceMountDeclaration[] = [
  // Chat. A mounted app like any other — not a special case in the schema.
  // `none` because the copilot module holds no records of its own; the chat
  // agent's reach comes from the OTHER modules mounted in the space.
  {
    agentAccess: "none",
    resourceKey: "engenty-copilot",
    resourceType: "module",
  },
  // Files live in the space Data tab, not as a choosable app. Every space has
  // a Files/ root; agents write there.
  {
    agentAccess: "write",
    resourceKey: "files",
    resourceType: "module",
  },
  // Connections is the account substrate other modules (files, inbox) require.
  // Specific accounts are still chosen on the optional step.
  {
    agentAccess: "write",
    resourceKey: "connections",
    resourceType: "module",
  },
  { resourceKey: "engenty.copilot", resourceType: "agent" },
  // Platform sub-agents every specialist may delegate to.
  { resourceKey: "engenty.cli", resourceType: "agent" },
  { resourceKey: "engenty.file-analyst", resourceType: "agent" },
];

export interface SpaceTemplate {
  /**
   * Why someone would pick this, in one line. English source copy; the dialog
   * prefers `spaces.templates.<id>.description` from the locale files and falls
   * back to this, so an API consumer without i18n still gets a sentence.
   */
  description: string;
  /**
   * Featured modules the create wizard preselects (removable). Agents that
   * belong to a module are mounted with it, not listed here.
   */
  featuredMountKeys: readonly string[];
  id: string;
  /** Baseline is implied — templates list only what they add on top. */
  mounts: readonly SpaceMountDeclaration[];
  name: string;
}

const moduleMount = (
  resourceKey: string,
  agentAccess: SpaceAgentAccessLevel = "write"
): SpaceMountDeclaration => ({
  agentAccess,
  resourceKey,
  resourceType: "module",
});

/**
 * Starting points for a new space.
 *
 * The wizard always opens with a purpose template and starts from baseline
 * plus that template's featured modules (the person can remove them). The
 * server still receives one explicit mount list and never applies a template
 * implicitly.
 */
// Templates list MODULES only: a module's agents derive from the module mount
// (T2.1) and the platform agents are baseline, so an agent row here would be
// the redundancy T2.5 deletes.
export const SPACE_TEMPLATES: readonly SpaceTemplate[] = [
  {
    description:
      "A client or engagement: offers, invoices, contacts and the projects that go with them.",
    id: "client",
    featuredMountKeys: ["module:tasks", "module:projects", "module:contacts"],
    mounts: [
      moduleMount("tasks"),
      moduleMount("projects"),
      moduleMount("offers"),
      moduleMount("invoices"),
      moduleMount("contacts"),
      moduleMount("knowledge-base"),
    ],
    name: "Client",
  },
  {
    description: "A team or department: ongoing work, shared knowledge, time.",
    id: "team",
    featuredMountKeys: [
      "module:tasks",
      "module:projects",
      "module:knowledge-base",
    ],
    mounts: [
      moduleMount("tasks"),
      moduleMount("projects"),
      moduleMount("team-chat"),
      moduleMount("knowledge-base"),
      moduleMount("time-tracking"),
    ],
    name: "Team",
  },
  {
    description: "A subject kept under observation: sources, notes, memory.",
    id: "research",
    featuredMountKeys: ["module:tasks", "module:knowledge-base"],
    mounts: [moduleMount("tasks"), moduleMount("knowledge-base")],
    name: "Research",
  },
  {
    description: "A private work area: tasks, files and inbox.",
    featuredMountKeys: ["module:tasks", "module:inbox"],
    id: "personal",
    mounts: [moduleMount("tasks"), moduleMount("inbox")],
    name: "Private work",
  },
  {
    description: "Chat and Files only. Add the apps this space needs.",
    featuredMountKeys: [],
    id: "blank",
    mounts: [],
    name: "Blank",
  },
];

export function getSpaceTemplate(id: string): SpaceTemplate | undefined {
  return SPACE_TEMPLATES.find((template) => template.id === id);
}

/**
 * Baseline entries the desired set is missing.
 *
 * Empty means the set is complete. Callers turn a non-empty result into a
 * rejection: the DAL because a POST that omits the baseline must fail, the
 * wizard because those mounts are added automatically and never offered as a
 * choice that could come back unchecked.
 */
export function missingBaselineMounts(
  desired: readonly Pick<
    SpaceMountDeclaration,
    "resourceKey" | "resourceType"
  >[]
): SpaceMountDeclaration[] {
  const present = new Set(desired.map(spaceMountKey));
  return SPACE_BASELINE_MOUNTS.filter(
    (mount) => !present.has(spaceMountKey(mount))
  );
}

/** True when `mount` is one of the entries no space may be without. */
export function isBaselineSpaceMount(
  mount: Pick<SpaceMountDeclaration, "resourceKey" | "resourceType">
): boolean {
  const key = spaceMountKey(mount);
  return SPACE_BASELINE_MOUNTS.some((entry) => spaceMountKey(entry) === key);
}

/**
 * How many engenties a space may hire. Counts the explicit `agent` mounts
 * that are not baseline — the copilot and its sub-agents are mounted
 * everywhere and are nobody's hire. Core refuses the mount past this, and
 * apps/ai checks it before writing a registry row, so a refused hire leaves
 * no orphan row behind.
 */
export const SPACE_AGENT_LIMIT = 20;

/** Keys of the hired engenties among a space's mounts (agent mounts minus baseline). */
export function hiredAgentMountKeys(
  mounts: readonly Pick<SpaceMountDeclaration, "resourceKey" | "resourceType">[]
): string[] {
  return mounts
    .filter(
      (mount) => mount.resourceType === "agent" && !isBaselineSpaceMount(mount)
    )
    .map((mount) => mount.resourceKey);
}

/**
 * A template's full mount set: baseline first, then its own additions, with the
 * template winning on `agent_access` if it names a baseline entry differently.
 */
export function spaceTemplateMounts(
  template: SpaceTemplate
): SpaceMountDeclaration[] {
  const byKey = new Map<string, SpaceMountDeclaration>();
  for (const mount of [...SPACE_BASELINE_MOUNTS, ...template.mounts]) {
    byKey.set(spaceMountKey(mount), mount);
  }
  return [...byKey.values()];
}

/**
 * Module mounts depend on each other the way plugins do.
 *
 * A manifest's `requires: ["module.tasks"]` is checked when the PLUGIN is
 * installed; it says nothing about a SPACE that mounts projects and not tasks —
 * where the project's task list, phases and time entries would point at a
 * module the space does not have. The same declaration is read here, so there
 * is one dependency list, not a second one kept for spaces.
 */

/** Map of module id → module ids it requires mounted alongside it. */
export type ModuleMountRequires = ReadonlyMap<string, readonly string[]>;

/** `module.tasks` → `tasks`; anything else (a sub-capability, a service) → null. */
export function moduleIdFromRequirement(capability: string): string | null {
  const match = /^module\.([a-z0-9][a-z0-9-]*)$/.exec(capability.trim());
  return match?.[1] ?? null;
}

/** Build the map from installed plugins' manifests. Modules with no deps are omitted. */
export function moduleMountRequiresFromPlugins(
  plugins: readonly { id: string; kind?: string; requires?: string[] }[]
): ModuleMountRequires {
  const map = new Map<string, string[]>();
  for (const plugin of plugins) {
    if ((plugin.kind ?? "module") !== "module") {
      continue;
    }
    const ids = (plugin.requires ?? [])
      .map(moduleIdFromRequirement)
      .filter((id): id is string => id !== null && id !== plugin.id);
    if (ids.length > 0) {
      map.set(plugin.id, ids);
    }
  }
  return map;
}

export interface MissingMountDependency {
  /** The module mount that needs the other one. */
  moduleId: string;
  /** The module it needs, absent from the set. */
  requires: string;
}

/**
 * Module mounts the set needs and lacks. Empty means the set is closed.
 *
 * Direct requirements only: a transitive chain (time-tracking → projects →
 * tasks) surfaces as one pair per missing link, each naming the mount that
 * actually asks for it.
 */
export function missingMountDependencies(
  desired: readonly Pick<
    SpaceMountDeclaration,
    "resourceKey" | "resourceType"
  >[],
  requires: ModuleMountRequires
): MissingMountDependency[] {
  const modules = new Set(
    desired
      .filter((mount) => mount.resourceType === "module")
      .map((mount) => mount.resourceKey.trim())
  );
  const missing: MissingMountDependency[] = [];
  for (const moduleId of modules) {
    for (const required of requires.get(moduleId) ?? []) {
      if (!modules.has(required)) {
        missing.push({ moduleId, requires: required });
      }
    }
  }
  return missing;
}

/** Module ids in the set that require `moduleId` — what removing it would break. */
export function moduleMountDependents(
  moduleId: string,
  mounted: readonly Pick<
    SpaceMountDeclaration,
    "resourceKey" | "resourceType"
  >[],
  requires: ModuleMountRequires
): string[] {
  return mounted
    .filter(
      (mount) =>
        mount.resourceType === "module" &&
        mount.resourceKey !== moduleId &&
        (requires.get(mount.resourceKey) ?? []).includes(moduleId)
    )
    .map((mount) => mount.resourceKey);
}
