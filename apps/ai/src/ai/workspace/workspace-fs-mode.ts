export type EngentyWorkspaceFsMode = "remote" | "local";

const REMOTE_ALIASES = new Set(["remote", "file-storage"]);

/** Workspace storage mode. Defaults to `remote`; set `ENGENTY_WORKSPACE_FS=local` only for offline tests. */
export function resolveEngentyWorkspaceFsMode(
  env: Partial<Pick<NodeJS.ProcessEnv, "ENGENTY_WORKSPACE_FS">> = process.env
): EngentyWorkspaceFsMode {
  const raw = env.ENGENTY_WORKSPACE_FS?.trim().toLowerCase();
  if (!raw || REMOTE_ALIASES.has(raw)) {
    return "remote";
  }
  if (raw === "local") {
    return "local";
  }
  throw new Error(`unsupported_engenty_workspace_fs:${raw}`);
}

/** True when sandbox staging dirs should sync to tenant storage via the core file-storage API. */
export function shouldUseRemoteWorkspaceSync(input: {
  fileStorageAccess?: { coreBaseUrl: string; accessToken: string } | null;
  mode?: EngentyWorkspaceFsMode;
}): boolean {
  return (
    (input.mode ?? resolveEngentyWorkspaceFsMode()) === "remote" &&
    Boolean(
      input.fileStorageAccess?.coreBaseUrl?.trim() &&
        input.fileStorageAccess.accessToken?.trim()
    )
  );
}
