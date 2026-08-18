import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DatePicker,
  Label,
  SidePanel,
  SidePanelContent,
  SidePanelFooter,
  Switch,
} from "@engenty/ui-core";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import type { ProjectPhase } from "../api.js";
import { useSidePanelWidth } from "../hooks/use-side-panel-width.js";
import {
  type PhaseDeleteConfirm,
  PhaseDeleteDialog,
  type PhaseDeleteTargetOption,
} from "./phase-delete-dialog.js";
import { TaskFormPanelHeader } from "./task-form-panel-header.js";

const PHASE_FORM_WIDTH_KEY = "projects.phaseFormWidth";
const PHASE_FORM_DEFAULT_WIDTH = 672;
const PHASE_FORM_MIN_WIDTH = 360;

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

interface PhaseFormDialogProps {
  onDelete?: (options: PhaseDeleteConfirm) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    start_date: string | null;
    end_date: string | null;
    is_main: boolean;
    is_public: boolean;
  }) => Promise<void>;
  open: boolean;
  phase?: ProjectPhase | null;
  projectName?: string;
  targetPhases?: PhaseDeleteTargetOption[];
  taskCount?: number;
}

export function PhaseFormDialog({
  open,
  onOpenChange,
  onDelete,
  onSubmit,
  phase,
  projectName,
  targetPhases = [],
  taskCount = 0,
}: PhaseFormDialogProps) {
  const { t } = useTranslation("projects");
  const formId = useId();
  const { width, startResize } = useSidePanelWidth({
    storageKey: PHASE_FORM_WIDTH_KEY,
    defaultWidth: PHASE_FORM_DEFAULT_WIDTH,
    minWidth: PHASE_FORM_MIN_WIDTH,
  });
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isMain, setIsMain] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setDeleteOpen(false);
      return;
    }
    setTitle(phase?.title ?? "");
    setStartDate(phase?.start_date ?? "");
    setEndDate(phase?.end_date ?? "");
    setIsMain(phase?.is_main ?? false);
    setIsPublic(phase?.is_public ?? false);
    setError(null);
  }, [open, phase]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!title.trim()) {
        setError(t("detail.phaseForm.titleRequired"));
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          title: title.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          is_main: isMain,
          is_public: isPublic,
        });
        onOpenChange(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("detail.phaseForm.saveFailed")
        );
      } finally {
        setSubmitting(false);
      }
    },
    [title, startDate, endDate, isMain, isPublic, onSubmit, onOpenChange, t]
  );

  const panelTitle = phase
    ? t("detail.phaseForm.editPhase")
    : t("detail.addPhase");
  const a11yTitle = projectName ? `${panelTitle} — ${projectName}` : panelTitle;

  return (
    <>
      <SidePanel onOpenChange={onOpenChange} open={open}>
        <SidePanelContent
          className="flex w-full flex-col gap-0 p-0 sm:max-w-none"
          showCloseButton={false}
          style={{ width: `${width}px`, maxWidth: "95vw" }}
        >
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
            onPointerDown={startResize}
          />
          <TaskFormPanelHeader
            actionsMenuLabel={t("detail.phaseForm.actionsMenu")}
            canDelete={Boolean(phase && onDelete)}
            closeLabel={t("detail.phaseForm.close")}
            onClose={() => onOpenChange(false)}
            onDelete={() => setDeleteOpen(true)}
            projectName={projectName}
            showExpand={false}
            title={a11yTitle}
          />

          <div className="flex-1 overflow-y-auto">
            <form className="space-y-4 p-4" id={formId} onSubmit={handleSubmit}>
              <textarea
                autoFocus
                className="w-full resize-none overflow-hidden bg-transparent font-semibold text-lg outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => {
                  setTitle(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                  }
                }}
                placeholder={t("detail.phaseForm.titlePlaceholder")}
                rows={1}
                value={title}
              />

              <div>
                <Label htmlFor="phase-start">
                  {t("detail.phaseForm.startDate")}
                </Label>
                <DatePicker
                  className="mt-1 w-full"
                  onChange={(nextValue) => setStartDate(nextValue ?? "")}
                  value={startDate || null}
                />
              </div>
              <div>
                <Label htmlFor="phase-end">
                  {t("detail.phaseForm.endDate")}
                </Label>
                <DatePicker
                  className="mt-1 w-full"
                  onChange={(nextValue) => setEndDate(nextValue ?? "")}
                  value={endDate || null}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label className="font-medium text-sm">
                  {t("detail.phaseForm.visibility")}
                </Label>
                <Button
                  aria-label={
                    isPublic
                      ? t("detail.taskForm.visibleToClient")
                      : t("detail.taskForm.internal")
                  }
                  onClick={() => setIsPublic((v) => !v)}
                  size="icon-sm"
                  title={
                    isPublic
                      ? t("detail.taskForm.visibleToClient")
                      : t("detail.taskForm.internal")
                  }
                  type="button"
                  variant="ghost"
                >
                  {isPublic ? (
                    <Eye className="h-4 w-4 text-green-600" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <Label className="font-medium text-sm" htmlFor="phase-main">
                    {t("detail.phaseForm.mainPhase")}
                  </Label>
                  <Switch
                    checked={isMain}
                    id="phase-main"
                    onCheckedChange={setIsMain}
                  />
                </div>
                <p className="mt-1.5 text-muted-foreground text-sm leading-snug">
                  {t("detail.phaseForm.mainPhaseHint")}
                </p>
              </div>

              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
            </form>
          </div>

          <SidePanelFooter className="p-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={submitting} form={formId} type="submit">
              {phase ? t("detail.phaseForm.save") : t("create.create")}
            </Button>
          </SidePanelFooter>
        </SidePanelContent>
      </SidePanel>

      {phase && onDelete ? (
        <PhaseDeleteDialog
          onClose={() => setDeleteOpen(false)}
          onConfirm={onDelete}
          open={deleteOpen}
          phaseTitle={phase.title}
          targetPhases={targetPhases}
          taskCount={taskCount}
        />
      ) : null}
    </>
  );
}
