import type { AiFileRecord } from "../../lib/admin/ai-runtime-api";

export interface SkillDetailFileEntry {
  label: string;
  path: string;
}

export function listSkillDetailFiles(
  files: Pick<AiFileRecord, "logical_path">[]
): SkillDetailFileEntry[] {
  return [...new Set(files.map((file) => file.logical_path))]
    .toSorted((left, right) => left.localeCompare(right))
    .map((path) => ({
      label: path,
      path,
    }));
}
