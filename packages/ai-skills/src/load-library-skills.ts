import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface LibrarySkillFile {
  bytes: Uint8Array;
  contentType: string;
  /** Path relative to the skill folder, e.g. `canvas-fonts/Lora-Regular.ttf`. */
  path: string;
}

export interface LibrarySkill {
  category: string;
  files: LibrarySkillFile[];
  name: string;
  skillMarkdown: string;
}

const DESCRIPTION_MD = "DESCRIPTION.md";
const SKILL_MD = "SKILL.md";

export function resolveLibrarySkillsDir(importMetaUrl: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    join(here, "..", "ai", "skills"),
    join(here, "ai", "skills"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find ai/skills directory relative to ${importMetaUrl}`
  );
}

export interface LibrarySkillRef {
  category: string;
  name: string;
}

/**
 * One category level: `ai/skills/<category>/<name>/SKILL.md`.
 * Seed storage is flat (`managed/<name>/`); category is metadata only.
 */
export function listLibrarySkillRefs(
  skillsDir = resolveLibrarySkillsDir(import.meta.url)
): LibrarySkillRef[] {
  if (!existsSync(skillsDir)) {
    return [];
  }
  const refs: LibrarySkillRef[] = [];
  const seen = new Map<string, string>();
  for (const categoryEntry of readdirSync(skillsDir, {
    withFileTypes: true,
  }).toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }
    const category = categoryEntry.name;
    const categoryDir = join(skillsDir, category);
    for (const skillEntry of readdirSync(categoryDir, {
      withFileTypes: true,
    }).toSorted((left, right) => left.name.localeCompare(right.name))) {
      if (!skillEntry.isDirectory()) {
        continue;
      }
      const skillMd = join(categoryDir, skillEntry.name, SKILL_MD);
      if (!existsSync(skillMd)) {
        continue;
      }
      const name = skillEntry.name;
      const existing = seen.get(name);
      if (existing) {
        throw new Error(
          `skill_name_collision:${name} (${existing} vs ${category})`
        );
      }
      seen.set(name, category);
      refs.push({ category, name });
    }
  }
  return refs;
}

function contentTypeForSkillPath(relativePath: string): string {
  switch (extname(relativePath).toLowerCase()) {
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

/** Every file under the skill folder except SKILL.md (references, scripts, fonts). */
export function listSkillSiblingFiles(skillDir: string): LibrarySkillFile[] {
  const files: LibrarySkillFile[] = [];
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      if (relative === SKILL_MD) {
        continue;
      }
      files.push({
        bytes: new Uint8Array(readFileSync(absolute)),
        contentType: contentTypeForSkillPath(relative),
        path: relative,
      });
    }
  };
  walk(skillDir, "");
  return files;
}

export function listLibrarySkills(
  skillsDir = resolveLibrarySkillsDir(import.meta.url)
): LibrarySkill[] {
  return listLibrarySkillRefs(skillsDir).map((ref) => {
    const skillDir = join(skillsDir, ref.category, ref.name);
    return {
      ...ref,
      files: listSkillSiblingFiles(skillDir),
      skillMarkdown: readFileSync(join(skillDir, SKILL_MD), "utf8"),
    };
  });
}

/** Names only — used by core pack install without reading skill bodies. */
export function librarySkillNamesByCategory(
  refs = listLibrarySkillRefs()
): Record<string, string[]> {
  const byCategory: Record<string, string[]> = {};
  for (const skill of refs) {
    const names = byCategory[skill.category] ?? [];
    names.push(skill.name);
    byCategory[skill.category] = names;
  }
  return byCategory;
}

export function libraryCategories(refs = listLibrarySkillRefs()): string[] {
  return [...new Set(refs.map((skill) => skill.category))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function readCategoryDescription(
  category: string,
  skillsDir = resolveLibrarySkillsDir(import.meta.url)
): string | null {
  const path = join(skillsDir, category, DESCRIPTION_MD);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}
