// Routed detail page for a routine (/mdl/tasks/routines/:id).
// Declared (module/builtin) routines are read-only except the enable toggle;
// custom routines additionally get Edit and Delete.
import {
  ENGENTY_COPILOT_HOST_KEY,
  WorkspaceArtifactPane,
} from "@engenty/ai-ui";
import {
  type RoutineDto,
  useDeleteCustomRoutineMutation,
  useRoutinesListQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RoutineDetailContent } from "../components/routine-detail-content.js";
import { RoutineDetailTopbarActions } from "../components/routine-detail-topbar-actions.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { tasksPaths } from "../lib/tasks-routes.js";

export function RoutineDetailPage() {
  const { t, i18n } = useTranslation("tasks");
  const navigate = useNavigate();
  // Routine ids contain ":" (custom:<uuid>) — react-router decodes the param.
  const { id } = useParams<{ id: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const routinesQuery = useRoutinesListQuery();
  const deleteMutation = useDeleteCustomRoutineMutation();
  const routine: RoutineDto | null =
    routinesQuery.data?.routines.find((entry: RoutineDto) => entry.id === id) ??
    null;

  const title = routine?.name ?? t("routines.page.title");
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: title }],
    [moduleRootCrumb, title]
  );
  const routineContainer = useMemo(
    () => (routine ? { id: routine.id, tier: "routine" as const } : null),
    [routine]
  );
  usePageConfig({
    actions: routine ? (
      <RoutineDetailTopbarActions
        onDelete={() => setDeleteOpen(true)}
        onEdit={() => navigate(tasksPaths.routineEdit(routine.id))}
        routine={routine}
      />
    ) : null,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const handleDelete = async () => {
    if (!routine) {
      return;
    }
    await deleteMutation.mutateAsync(routine.id);
    navigate(tasksPaths.routines);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-page pb-10">
      {routinesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : routinesQuery.isError ? (
        <p className="text-destructive text-sm">{t("routines.loadFailed")}</p>
      ) : routine ? (
        <RoutineDetailContent
          locale={i18n.language || "en"}
          routine={routine}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("routines.detail.notFound")}
        </p>
      )}

      {/* Same chat host as task detail — WorkPanel rows + live artifacts share one pane. */}
      <WorkspaceArtifactPane
        container={routineContainer}
        hostKey={ENGENTY_COPILOT_HOST_KEY}
      />

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("routines.delete.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("routines.delete.confirmDescription", {
                name: routine?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("routines.delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              {t("routines.delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
