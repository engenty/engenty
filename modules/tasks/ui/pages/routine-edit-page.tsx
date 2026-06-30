// Routed edit page for custom routines (/mdl/tasks/routines/:id/edit).
// Declared routines are not editable — non-custom ids redirect to the detail page.
import {
  RoutineForm,
  type RoutineFormValue,
  routineFormToPayload,
  routineToFormValue,
  useRoutinesListQuery,
  useUpdateCustomRoutineMutation,
  validateRoutineForm,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { tasksPaths } from "../lib/tasks-routes.js";

export function RoutineEditPage() {
  const { t, i18n } = useTranslation("tasks");
  const { t: tAi } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const routinesQuery = useRoutinesListQuery();
  const updateMutation = useUpdateCustomRoutineMutation();
  const routine =
    routinesQuery.data?.routines.find((entry) => entry.id === id) ?? null;

  const [value, setValue] = useState<RoutineFormValue | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    if (routine && !value) {
      setValue(routineToFormValue(routine));
    }
  }, [routine, value]);

  const detailPath = tasksPaths.routineDetail(id ?? "");
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: routine?.name ?? "…", to: detailPath },
      { label: t("routines.edit.title") },
    ],
    [moduleRootCrumb, t, routine?.name, detailPath]
  );
  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    title: t("routines.edit.title"),
    topbarChrome: "contentBlend",
  });

  if (routinesQuery.isPending) {
    return (
      <section className="p-page">
        <p className="text-muted-foreground text-sm">…</p>
      </section>
    );
  }
  if (!routine) {
    return <Navigate replace to={tasksPaths.routines} />;
  }
  if (routine.source !== "custom") {
    return <Navigate replace to={detailPath} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) {
      return;
    }
    setErrorMsg(null);
    const errorKey = validateRoutineForm(value);
    if (errorKey) {
      setErrorMsg(tAi(`routines.form.errors.${errorKey}`));
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: routine.id,
        body: routineFormToPayload(value),
      });
      navigate(detailPath);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tAi("routines.form.errors.actionFailed")
      );
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-page pb-10">
      <Card className="mx-auto w-full max-w-2xl p-6" variant="form">
        <form className="space-y-5" onSubmit={handleSubmit}>
          {value && (
            <RoutineForm
              locale={i18n.language || "en"}
              onChange={setValue}
              showAgentPicker
              value={value}
            />
          )}
          {errorMsg && (
            <p className="text-destructive text-sm" role="alert">
              {errorMsg}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              disabled={updateMutation.isPending}
              onClick={() => navigate(detailPath)}
              type="button"
              variant="outline"
            >
              {t("routines.edit.cancel")}
            </Button>
            <Button disabled={updateMutation.isPending} type="submit">
              {t("routines.edit.save")}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
