import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Spinner } from "@engenty/ui-core";
import { Shapes } from "lucide-react";
import { ArtifactStoragePicker } from "./artifact-storage-picker.js";
import { activateArtifact } from "./artifact-store.js";
import { useArtifactsListQuery } from "./artifacts-api.js";
import { WorkspaceArtifactPane } from "./workspace-artifact-pane.js";

/** One pane host shared by all project detail pages (scope re-seeds per project). */
export const ENGENTY_PROJECT_ARTIFACTS_HOST_KEY = "engenty.artifacts.project";

/**
 * Project "Artifacts" tab body: lists the artifacts stored on the project;
 * clicking a row opens it in a project-scoped artifact pane mounted alongside.
 * Registered by the projects module via `registerTab`.
 */
export function ProjectArtifactsPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation("ai-ui");
  const listQuery = useArtifactsListQuery("project", projectId);
  const artifacts = listQuery.data ?? [];
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-label={t("artifacts.paneLabel")} className="mt-4">
      <div className="mb-2 flex justify-end">
        <ArtifactStoragePicker scopeId={projectId} scopeType="project" />
      </div>
      {listQuery.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : artifacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Shapes className="h-6 w-6 text-muted-foreground/50" />
          <p className="max-w-sm text-muted-foreground text-sm">
            {t("artifacts.projectEmpty")}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {artifacts.map((artifact) => (
            <Button
              className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 first:rounded-t-md last:rounded-b-md"
              key={artifact.id}
              onClick={() =>
                activateArtifact(
                  ENGENTY_PROJECT_ARTIFACTS_HOST_KEY,
                  artifact.id
                )
              }
              variant="ghost"
            >
              <Shapes className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {artifact.title}
              </span>
              <Badge className="shrink-0" variant="secondary">
                {artifact.type}
              </Badge>
              <span className="shrink-0 text-muted-foreground text-xs">
                {dateFormat.format(new Date(artifact.updated_at))}
              </span>
            </Button>
          ))}
        </div>
      )}
      <WorkspaceArtifactPane
        hostKey={ENGENTY_PROJECT_ARTIFACTS_HOST_KEY}
        scope={{ type: "project", id: projectId }}
      />
    </section>
  );
}
