// Routines list page — rows navigate to the routed detail page;
// creation stays a dialog (analogous to task/goal creation).
import { RoutineCreateDialog } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RoutinesCardList } from "../components/routines-card-list.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { tasksPaths } from "../lib/tasks-routes.js";

export function RoutinesPage() {
  const { t, i18n } = useTranslation("tasks");
  const locale = i18n.language || "en";
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <section className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-page">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {t("routines.page.title")}
          </h1>
          <p className="max-w-xl text-muted-foreground text-sm">
            {t("routines.page.description")}
          </p>
        </div>

        <Button
          className="inline-flex shrink-0 items-center gap-1.5"
          onClick={() => setIsCreateOpen(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          {t("routines.page.create")}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <RoutinesCardList
          locale={locale}
          onAddRoutine={() => setIsCreateOpen(true)}
          onEditRoutine={(routine) =>
            navigate(tasksPaths.routineEdit(routine.id))
          }
          onSelectRoutine={(routine) =>
            navigate(tasksPaths.routineDetail(routine.id))
          }
        />
      </div>

      <RoutineCreateDialog
        locale={locale}
        onOpenChange={setIsCreateOpen}
        open={isCreateOpen}
      />
    </section>
  );
}
