import type { AiSkillRecord } from "../../lib/admin/ai-runtime-types.js";

export interface SkillPack {
  category: string;
  description: string | null;
  icon: string | null;
  skills: AiSkillRecord[];
  title: string;
}

export function humanizeSlug(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (!spaced) {
    return slug;
  }
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function skillPackage(skill: AiSkillRecord) {
  const fromMeta = skill.metadata.category?.trim();
  if (fromMeta) {
    return fromMeta;
  }
  const moduleId = skill.engenty_modules?.[0]?.trim();
  if (moduleId) {
    return moduleId;
  }
  return skill.owner_kind;
}

export function packMatchesQuery(pack: SkillPack, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (pack.title.toLowerCase().includes(needle)) {
    return true;
  }
  if (pack.category.toLowerCase().includes(needle)) {
    return true;
  }
  if (pack.description?.toLowerCase().includes(needle)) {
    return true;
  }
  return pack.skills.some(
    (skill) =>
      skill.name.toLowerCase().includes(needle) ||
      (skill.title?.toLowerCase().includes(needle) ?? false)
  );
}

export function groupSkills(skills: AiSkillRecord[]): SkillPack[] {
  const groups = new Map<string, AiSkillRecord[]>();
  for (const skill of skills) {
    const category = skillPackage(skill);
    const list = groups.get(category) ?? [];
    list.push(skill);
    groups.set(category, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, list]) => {
      const sorted = [...list].sort((a, b) =>
        (a.title || a.name).localeCompare(b.title || b.name)
      );
      return {
        category,
        description: packDescription(sorted, category),
        icon: packIcon(sorted),
        skills: sorted,
        title: packTitle(category, sorted),
      };
    });
}

function packTitle(category: string, skills: AiSkillRecord[]): string {
  const overview = skills.find((skill) => skill.name === category);
  const title = overview?.title?.trim();
  if (title && title.toLowerCase() !== category.toLowerCase()) {
    return title;
  }
  return humanizeSlug(category);
}

function packDescription(
  skills: AiSkillRecord[],
  category: string
): string | null {
  const overview = skills.find((skill) => skill.name === category);
  const fromOverview = overview?.description?.trim();
  if (fromOverview) {
    return fromOverview;
  }
  for (const skill of skills) {
    const description = skill.description?.trim();
    if (description) {
      return description;
    }
  }
  return null;
}

function packIcon(skills: AiSkillRecord[]): string | null {
  for (const skill of skills) {
    const emoji = skill.metadata.emoji?.trim();
    if (emoji) {
      return emoji;
    }
    const icon = skill.metadata.icon?.trim();
    if (icon) {
      return icon;
    }
  }
  return null;
}
