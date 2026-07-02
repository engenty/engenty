import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { FileManager } from "../file-manager.js";

/**
 * Contributed `projects.detail` tab body — mounts the reusable file manager
 * bound to the project as the file-space owner. `params` is supplied by the
 * projects module (see `PROJECTS_DETAIL_SURFACE`); this module only knows the
 * shape it needs, not the host page itself.
 */
export function ProjectFilesTab({ params }: UiTabRenderProps) {
  const projectId = params.projectId as string | undefined;
  const readOnly = params.viewMode === "external";
  const owner = useMemo(
    () => ({ type: "project", id: projectId ?? "" }),
    [projectId]
  );

  if (!projectId) {
    return null;
  }

  return (
    <div className="mt-4">
      <FileManager owner={owner} readOnly={readOnly} />
    </div>
  );
}
