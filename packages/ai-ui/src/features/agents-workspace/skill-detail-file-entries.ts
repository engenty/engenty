import type { AiFileRecord } from "../../lib/admin/ai-runtime-api";

export interface SkillDetailFileEntry {
  label: string;
  path: string;
}

export function normalizeSkillFilePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

export function listSkillDetailFiles(
  files: Pick<AiFileRecord, "logical_path">[]
): SkillDetailFileEntry[] {
  const paths = new Set(
    files
      .map((file) => normalizeSkillFilePath(file.logical_path))
      .filter((path) => path.length > 0 && !path.split("/").includes(".."))
  );
  paths.add("SKILL.md");
  return [...paths]
    .toSorted((left, right) => {
      if (left === "SKILL.md") {
        return -1;
      }
      if (right === "SKILL.md") {
        return 1;
      }
      return left.localeCompare(right);
    })
    .map((path) => ({
      label: path.split("/").at(-1) ?? path,
      path,
    }));
}

export interface SkillFileFolderGroup {
  files: SkillDetailFileEntry[];
  folder: string | null;
}

export function groupSkillDetailFiles(
  files: SkillDetailFileEntry[]
): SkillFileFolderGroup[] {
  const root: SkillDetailFileEntry[] = [];
  const folders = new Map<string, SkillDetailFileEntry[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    if (slash === -1) {
      root.push(file);
      continue;
    }
    const folder = file.path.slice(0, slash);
    const existing = folders.get(folder) ?? [];
    existing.push(file);
    folders.set(folder, existing);
  }
  const groups: SkillFileFolderGroup[] = [];
  if (root.length > 0) {
    groups.push({ files: root, folder: null });
  }
  for (const folder of [...folders.keys()].toSorted((left, right) =>
    left.localeCompare(right)
  )) {
    groups.push({ files: folders.get(folder) ?? [], folder });
  }
  return groups;
}
