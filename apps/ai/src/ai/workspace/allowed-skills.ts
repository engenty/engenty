// Resolve which skill directories a run may see on the tenant `/skills` mount.
// Ownership comes from the dynamic capability registry (`capability.skills`
// keys per `moduleId`) — never a hand-written module→skill table.

import type { DynamicAiModuleCapability } from "@engenty/ai-core";

import { runtimeManagedSkillNames } from "../../../ai/skills/index.js";
import type { EngentyWorkspaceMountSpec } from "./contracts.js";

export type AllowedSkillResolutionKind = "global" | "resolved" | "unresolved";

export type ModuleSkillCapability = Pick<
  DynamicAiModuleCapability,
  "moduleId" | "skills"
>;

function trimmedName(value: string): string | null {
  const name = value.trim();
  return name.length > 0 ? name : null;
}

/** Runtime playbooks: always visible on a resolved run. Not library or copilot product skills. */
export function builtinPlatformSkillNames(): string[] {
  return runtimeManagedSkillNames();
}

/**
 * Map each module id to the skill names it owns, from the capability seed
 * channel (`skills` is a name → SKILL.md record).
 */
export function skillNamesByModuleFromCapabilities(
  capabilities: readonly ModuleSkillCapability[]
): Map<string, string[]> {
  const byModule = new Map<string, string[]>();
  for (const capability of capabilities) {
    const moduleId = capability.moduleId.trim();
    if (!moduleId) {
      continue;
    }
    const names = Object.keys(capability.skills ?? {})
      .map(trimmedName)
      .filter((name): name is string => name !== null);
    if (names.length > 0) {
      byModule.set(moduleId, names);
    }
  }
  return byModule;
}

export interface ResolveAllowedSkillNamesInput {
  explicitSkillNames?: readonly string[];
  kind: AllowedSkillResolutionKind;
  moduleSkills: ReadonlyMap<string, readonly string[]>;
  mountedModuleIds?: Iterable<string>;
  /**
   * Skills that are not module-owned (builtin copilot playbooks). Included on
   * resolved runs so platform skills stay visible the same way platform tools
   * are. Ignored for unresolved (fail closed) and unused for global (no filter).
   */
  platformSkillNames?: readonly string[];
  preferredSkillNames?: readonly string[];
}

/**
 * Allowed skill directory names for a run.
 *
 * - `global` → `undefined` (no filter; tenant-wide discovery)
 * - `unresolved` → `[]` (hide every skill directory)
 * - `resolved` → union of explicit Space mounts, skills owned by mounted
 *   modules, the active agent's preferred skills, and optional platform skills
 */
export function resolveAllowedSkillNames(
  input: ResolveAllowedSkillNamesInput
): string[] | undefined {
  if (input.kind === "global") {
    return;
  }
  if (input.kind === "unresolved") {
    return [];
  }

  const allowed = new Set<string>();
  const addAll = (names: readonly string[] | undefined) => {
    for (const raw of names ?? []) {
      const name = trimmedName(raw);
      if (name) {
        allowed.add(name);
      }
    }
  };

  addAll(input.explicitSkillNames);
  addAll(input.preferredSkillNames);
  addAll(input.platformSkillNames);

  for (const rawModuleId of input.mountedModuleIds ?? []) {
    const moduleId = trimmedName(rawModuleId);
    if (!moduleId) {
      continue;
    }
    addAll(input.moduleSkills.get(moduleId) ?? []);
  }

  return [...allowed].sort((a, b) => a.localeCompare(b));
}

/** True when this mount is the tenant skill library (`ai/skills/`). */
export function isSkillWorkspaceMount(
  mount: EngentyWorkspaceMountSpec
): boolean {
  const relative = mount.fileStorageRelativePath.replace(/\/+$/, "");
  if (relative === "ai/skills" || relative.startsWith("ai/skills/")) {
    return true;
  }
  return mount.mountPath === "/skills" || mount.mountPath === "/tenant-skills";
}
