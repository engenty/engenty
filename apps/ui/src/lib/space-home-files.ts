/**
 * The home's Files box: connected folders and files at the space file-space
 * root — the same store Data → Files shows.
 */
import type { SpaceDriveFile, SpaceDriveFolder } from "@engenty/file-storage";

export const SPACE_HOME_FILES_SHOWN = 6;

/** A folder is connected when its bytes live in an external account. */
export function isConnectedDriveFolder(folder: SpaceDriveFolder): boolean {
  return Boolean(
    folder.connectionId || (folder.source && folder.source !== "native")
  );
}

export function selectSpaceHomeConnectedFolders(
  folders: readonly SpaceDriveFolder[]
): SpaceDriveFolder[] {
  return folders
    .filter(isConnectedDriveFolder)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Newest first so a drop on home shows up at the top of the rail. */
export function selectSpaceHomeListedFiles(
  files: readonly SpaceDriveFile[]
): SpaceDriveFile[] {
  return files.slice().sort((left, right) => {
    const byTime = (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    return byTime === 0 ? left.name.localeCompare(right.name) : byTime;
  });
}

/**
 * Copy files out of a live `FileList` before the input is reset.
 *
 * `input.files` is a live view of the control. Clearing `value` so the same
 * file can be chosen again empties that view — `Array.from` after the reset
 * uploads nothing, with no error.
 */
export function takeDroppedFiles(
  files: FileList | File[] | null | undefined
): File[] {
  return files && files.length > 0 ? Array.from(files) : [];
}
