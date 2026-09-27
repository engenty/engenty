/**
 * The home's Skills box: what this space's engenties can actually use, by
 * where each skill comes from.
 *
 * Mirrors what a run in the space sees (apps/ai `resolveAllowedSkillNames`):
 * skills mounted on the space, the skills of its modules, and the platform's
 * own playbooks. The tenant's library skills that are NOT on the space are the
 * one exception — listed so they can be added, and marked as not in use.
 */
import type { SpaceCatalogSkill } from "@/lib/api/spaces-client";

export interface SpaceHomeSkill {
  description: string;
  label: string;
  name: string;
}

export type SpaceHomeSkillFolderKind = "module" | "engenty" | "tenant";

export interface SpaceHomeSkillFolder {
  /** The module id, or the kind for the engenty and tenant folders. */
  id: string;
  kind: SpaceHomeSkillFolderKind;
  /** The module's name; the engenty and tenant folders name themselves. */
  label: string | null;
  skills: SpaceHomeSkill[];
}

export interface SpaceHomeSkills {
  folders: SpaceHomeSkillFolder[];
  /** The tenant's own skills mounted on this space. */
  own: SpaceHomeSkill[];
}

/** Platform playbooks every run in a space sees. */
const ALWAYS_ON_SOURCE = "builtin";

function toSkill(skill: SpaceCatalogSkill): SpaceHomeSkill {
  return {
    description: skill.description,
    label: skill.title?.trim() || skill.name,
    name: skill.name,
  };
}

const byLabel = (left: SpaceHomeSkill, right: SpaceHomeSkill) =>
  left.label.localeCompare(right.label);

export function groupSpaceHomeSkills(input: {
  catalog: readonly SpaceCatalogSkill[];
  /** Modules mounted with agent access — the ones whose skills a run gets. */
  mountedModules: ReadonlySet<string>;
  mountedSkills: ReadonlySet<string>;
  moduleNames: ReadonlyMap<string, string>;
}): SpaceHomeSkills {
  const { catalog, mountedModules, mountedSkills, moduleNames } = input;
  const own: SpaceHomeSkill[] = [];
  const engenty: SpaceHomeSkill[] = [];
  const tenant: SpaceHomeSkill[] = [];
  const byModule = new Map<string, SpaceHomeSkill[]>();
  const known = new Set<string>();

  for (const skill of catalog) {
    known.add(skill.name);
    const mounted = mountedSkills.has(skill.name);
    if (skill.tier === "custom") {
      (mounted ? own : tenant).push(toSkill(skill));
      continue;
    }
    if (skill.source === ALWAYS_ON_SOURCE) {
      engenty.push(toSkill(skill));
      continue;
    }
    const owners = skill.engenty_modules ?? [];
    const mountedOwner = owners.find((moduleId) =>
      mountedModules.has(moduleId)
    );
    if (owners.length > 0 && (mountedOwner || mounted)) {
      const moduleId = mountedOwner ?? owners[0] ?? "";
      const list = byModule.get(moduleId) ?? [];
      list.push(toSkill(skill));
      byModule.set(moduleId, list);
      continue;
    }
    if (owners.length === 0 && mounted) {
      engenty.push(toSkill(skill));
    }
  }

  // A mount whose skill has left the catalog still reaches the space's runs
  // by name; it stays visible where it can be recognised and removed.
  for (const name of mountedSkills) {
    if (!known.has(name)) {
      own.push({ description: "", label: name, name });
    }
  }

  const moduleFolders = [...byModule.entries()]
    .map(
      ([moduleId, skills]): SpaceHomeSkillFolder => ({
        id: moduleId,
        kind: "module",
        label: moduleNames.get(moduleId) ?? moduleId,
        skills: skills.sort(byLabel),
      })
    )
    .sort((left, right) => (left.label ?? "").localeCompare(right.label ?? ""));
  const folders: SpaceHomeSkillFolder[] = [...moduleFolders];
  if (engenty.length > 0) {
    folders.push({
      id: "engenty",
      kind: "engenty",
      label: null,
      skills: engenty.sort(byLabel),
    });
  }
  if (tenant.length > 0) {
    folders.push({
      id: "tenant",
      kind: "tenant",
      label: null,
      skills: tenant.sort(byLabel),
    });
  }
  return { folders, own: own.sort(byLabel) };
}
