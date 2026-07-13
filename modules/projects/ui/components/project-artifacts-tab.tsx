import { ProjectArtifactsPanel } from "@engenty/ai-ui";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";

/**
 * "Artifacts" tab on the project detail page — artifacts stored (promoted)
 * to this project from chats. Hidden on the external portal view: the
 * artifact API requires an authenticated workspace user.
 */
export function ProjectArtifactsTab({ params }: UiTabRenderProps) {
  const projectId = params.projectId as string | undefined;
  const external = params.viewMode === "external";

  if (!projectId || external) {
    return null;
  }

  return <ProjectArtifactsPanel projectId={projectId} />;
}
