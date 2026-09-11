import { rankRecordsLexically } from "@engenty/search-index";
import type { AiSkillRecord } from "../../lib/admin/ai-runtime-api";
import { getSkillModuleId } from "./skill-record-utils";

export type SkillCatalogGroupBy = "module" | "source" | "tier" | "none";
export type SkillCatalogOriginFilter = "all" | "core" | "module" | "tenant";
export type SkillCatalogSortBy = "name" | "module" | "updated_at";
export type SkillCatalogTierFilter = "all" | "managed" | "custom";

export interface NormalizedSkillRecord extends AiSkillRecord {
  engenty_modules: string[];
  module_id: string;
  origin: Exclude<SkillCatalogOriginFilter, "all">;
  requires_sandbox: boolean;
}

export interface SkillCatalogState {
  groupBy: SkillCatalogGroupBy;
  moduleFilter: string;
  originFilter: SkillCatalogOriginFilter;
  searchQuery: string;
  sortBy: SkillCatalogSortBy;
  sortOrder: "asc" | "desc";
  tierFilter: SkillCatalogTierFilter;
}

export interface SkillCatalogGroup {
  id: string;
  label: string;
  skills: NormalizedSkillRecord[];
}

const CORE_MODULE_IDS = new Set(["engenty-core", "core"]);

export function normalizeSkillRecord(
  skill: AiSkillRecord
): NormalizedSkillRecord {
  const module_id = getSkillModuleId(skill);
  const engenty_modules =
    skill.engenty_modules && skill.engenty_modules.length > 0
      ? skill.engenty_modules
      : [module_id];
  const origin =
    skill.source_kind === "user" || skill.tier === "custom"
      ? "tenant"
      : CORE_MODULE_IDS.has(module_id)
        ? "core"
        : "module";
  return {
    ...skill,
    engenty_modules,
    module_id,
    origin,
    requires_sandbox: skill.requires_sandbox ?? false,
  };
}

function skillCatalogRecord(skill: NormalizedSkillRecord) {
  return {
    description: skill.description ?? "",
    id: skill.name,
    modules: skill.engenty_modules,
    name: skill.title?.trim() || skill.name,
    source: skill.source_reference ?? "",
    tags: [
      skill.tier,
      skill.origin,
      skill.module_id,
      skill.requires_sandbox ? "sandbox shell" : "",
    ].filter(Boolean),
    title: skill.title ?? "",
  };
}

export function getSkillCatalogModules(
  skills: readonly NormalizedSkillRecord[]
): string[] {
  return [...new Set(skills.map((skill) => skill.module_id))]
    .filter(Boolean)
    .toSorted((left, right) => left.localeCompare(right));
}

export function filterAndSortSkills(
  skills: readonly NormalizedSkillRecord[],
  state: SkillCatalogState
): NormalizedSkillRecord[] {
  const query = state.searchQuery.trim();
  const filtered = skills.filter((skill) => {
    if (state.originFilter !== "all" && skill.origin !== state.originFilter) {
      return false;
    }
    if (state.tierFilter !== "all" && skill.tier !== state.tierFilter) {
      return false;
    }
    return !(
      state.moduleFilter !== "all" && skill.module_id !== state.moduleFilter
    );
  });

  if (query) {
    return rankRecordsLexically(filtered, query, skillCatalogRecord);
  }

  const direction = state.sortOrder === "asc" ? 1 : -1;
  return filtered.toSorted((left, right) => {
    const leftValue =
      state.sortBy === "module"
        ? `${left.module_id}:${left.name}`
        : state.sortBy === "updated_at"
          ? `${left.updated_at}:${left.name}`
          : left.title?.trim() || left.name;
    const rightValue =
      state.sortBy === "module"
        ? `${right.module_id}:${right.name}`
        : state.sortBy === "updated_at"
          ? `${right.updated_at}:${right.name}`
          : right.title?.trim() || right.name;
    return leftValue.localeCompare(rightValue) * direction;
  });
}

export function groupSkills(
  skills: readonly NormalizedSkillRecord[],
  groupBy: SkillCatalogGroupBy,
  labels: {
    core: string;
    custom: string;
    managed: string;
    module: string;
    tenant: string;
    ungrouped: string;
  }
): SkillCatalogGroup[] {
  if (skills.length === 0) {
    return [];
  }
  if (groupBy === "none") {
    return [{ id: "all", label: labels.ungrouped, skills: [...skills] }];
  }

  const groups = new Map<string, NormalizedSkillRecord[]>();
  for (const skill of skills) {
    const key =
      groupBy === "module"
        ? skill.module_id
        : groupBy === "tier"
          ? (skill.tier ?? "managed")
          : skill.origin;
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }

  return [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([id, groupSkillsForId]) => ({
      id,
      label:
        groupBy === "source"
          ? ({
              core: labels.core,
              module: labels.module,
              tenant: labels.tenant,
            }[id] ?? id)
          : groupBy === "tier"
            ? ({ custom: labels.custom, managed: labels.managed }[id] ?? id)
            : id,
      skills: groupSkillsForId,
    }));
}
