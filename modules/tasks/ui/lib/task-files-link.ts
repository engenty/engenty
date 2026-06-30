import { taskWorkspaceStoragePrefix } from "../../src/lib/task-workspace.js";

export function buildTaskWorkspaceFilesHref(
  tenantId: string,
  identifier: string
): string {
  const prefix = taskWorkspaceStoragePrefix(tenantId, identifier);
  const params = new URLSearchParams({ prefix: `${prefix}/` });
  return `/admin/files?${params.toString()}`;
}
