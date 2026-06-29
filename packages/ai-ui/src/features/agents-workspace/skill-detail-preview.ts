import { buildSkillSourceFromDraft, type SkillDraft } from "./skill-draft.js";

interface ResolveSkillDetailCodePreviewInput {
  draft: SkillDraft | null;
  isEditing: boolean;
  selectedFile: string;
  selectedFileContentText: string | null | undefined;
  sourceText: string;
}

export function resolveSkillDetailCodePreview({
  draft,
  isEditing,
  selectedFile,
  selectedFileContentText,
  sourceText,
}: ResolveSkillDetailCodePreviewInput) {
  if (isEditing) {
    return sourceText;
  }

  if (selectedFileContentText?.trim()) {
    return selectedFileContentText;
  }

  if (selectedFile === "SKILL.md" && draft) {
    return buildSkillSourceFromDraft(draft);
  }

  return selectedFileContentText ?? "";
}
