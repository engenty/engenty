/**
 * The label a Data-tree section heading (and the matching hub tile) shows.
 *
 * Adapter roots keep their on-disk name in the tree; the heading prefers the
 * translated module name so Contacts reads as Kontakte. Files is special-cased
 * because its module id is `files` while the tab copy is Dateien / Files.
 */
import type { DriveNode } from "@engenty/file-storage";

export function spaceDataSectionHeadingLabel(
  section: { label: string; root: DriveNode | null },
  labelsByModuleId: Record<string, string>,
  t: (key: string, options?: { defaultValue: string }) => string
): string {
  const moduleId = section.root?.moduleId;
  if (moduleId === "files") {
    return t("spaces.data.filesSection", { defaultValue: "Files" });
  }
  if (moduleId && labelsByModuleId[moduleId]) {
    return labelsByModuleId[moduleId];
  }
  return section.label;
}
