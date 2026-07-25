import { WorkPanel } from "@engenty/ai-ui";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";

/** Pane host for the project work surface (scope re-seeds per project). */
const ENGENTY_PROJECT_WORK_HOST_KEY = "engenty.work.project";

/**
 * "Artifacts" tab on the project detail page — the shared work surface
 * (artifacts + workspace files) aggregated over the project container: its
 * own scope plus its goals and tasks. Hidden on the external portal view: the
 * artifact API requires an authenticated workspace user.
 */
export function ProjectArtifactsTab({ params }: UiTabRenderProps) {
  const projectId = params.projectId as string | undefined;
  const external = params.viewMode === "external";

  if (!projectId || external) {
    return null;
  }

  return (
    <WorkPanel
      className="mt-4 max-w-4xl"
      container={{ id: projectId, tier: "project" }}
      hostKey={ENGENTY_PROJECT_WORK_HOST_KEY}
      showViewToggle
    />
  );
}
