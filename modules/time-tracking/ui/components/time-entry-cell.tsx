import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  NumberStepper,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";
import { MoveEntryDialog } from "./move-entry-dialog.js";
import { NotesPopover } from "./notes-popover.js";
import { useTimeTrackingContext } from "./time-tracking-context.js";
import type { TimeEntry, TrackingRow } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimeEntryCellProps {
  day: Date;
  entry: TimeEntry | undefined;
  onDelete: () => void;
  onSave: (
    hours: number,
    notes: string | null,
    discipline: string | null
  ) => void;
  row: TrackingRow;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimeEntryCell({
  row,
  day,
  entry,
  onSave,
  onDelete,
}: TimeEntryCellProps) {
  const { t } = useTranslation("time-tracking");
  const ctx = useTimeTrackingContext();

  // ------------------------------------------------------------------
  // UI state
  // ------------------------------------------------------------------
  const [localHours, setLocalHours] = useState<string>(
    entry?.hours == null ? "" : String(entry.hours)
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<string>(entry?.notes ?? "");
  const [localDiscipline, setLocalDiscipline] = useState<string>(
    entry?.discipline ?? "NONE"
  );
  const [disciplinePickerOpen, setDisciplinePickerOpen] = useState(false);

  const cellRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Sync from server
  // ------------------------------------------------------------------
  useEffect(() => {
    const isFocused =
      cellRef.current?.contains(document.activeElement) ?? false;
    const serverHours = entry?.hours == null ? "" : String(entry.hours);

    // Don't overwrite what the user is typing if the cell is currently focused
    if (!isFocused) {
      setLocalHours(serverHours);
    }
    // Only sync notes/discipline if we're not actively editing them
    if (!notesOpen) {
      setLocalNotes(entry?.notes ?? "");
      setLocalDiscipline(entry?.discipline ?? "NONE");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, entry?.hours, entry?.notes, entry?.discipline]);

  // ------------------------------------------------------------------
  // Save logic
  // ------------------------------------------------------------------
  function attemptSave(
    hoursStr: string,
    currentNotes: string,
    currentDiscipline: string
  ) {
    const parsed = Number.parseFloat(hoursStr.replace(",", "."));
    const serverHours = entry?.hours ?? 0;

    if (!hoursStr.trim() || Number.isNaN(parsed) || parsed <= 0) {
      // Cleared
      if (entry) {
        onDelete();
        setLocalHours("");
      }
      return;
    }

    // Check what changed compared to the server entry
    const hoursChanged = parsed !== serverHours;
    const notesChanged = currentNotes !== (entry?.notes ?? "");
    const disciplineChanged =
      currentDiscipline !== (entry?.discipline ?? "NONE");

    if (!(hoursChanged || notesChanged || disciplineChanged)) {
      return;
    }

    const resolvedNotes = currentNotes.trim()
      ? currentNotes
      : (entry?.notes ?? null);
    const resolvedDiscipline =
      currentDiscipline === "NONE"
        ? (entry?.discipline ?? null)
        : currentDiscipline;

    onSave(parsed, resolvedNotes, resolvedDiscipline);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const hasNotes = Boolean(localNotes.trim());
  const displayValue = localHours;

  return (
    <td className="min-w-24 px-0.5 py-1 text-center md:min-w-0">
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div
              className="relative"
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement | null;
                // Stay open if focus moves into the notes popover or discipline picker
                const staysInCell =
                  relatedTarget?.closest(".notes-popover") ||
                  disciplinePickerOpen;

                if (!staysInCell) {
                  attemptSave(localHours, localNotes, localDiscipline);
                  setNotesOpen(false);
                }
              }}
              onKeyDown={(e) => {
                const target = e.target as HTMLElement;
                const inPopover = Boolean(target.closest(".notes-popover"));

                if (e.key === "Tab" && !inPopover && !e.shiftKey) {
                  e.preventDefault();
                  const textarea = e.currentTarget.querySelector("textarea");
                  if (textarea) {
                    textarea.focus();
                  } else {
                    setNotesOpen(true);
                    // Wait for the next tick for the textarea to be rendered
                    setTimeout(() => {
                      e.currentTarget.querySelector("textarea")?.focus();
                    }, 0);
                  }
                }

                if (
                  (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
                  (e.metaKey || e.altKey || e.ctrlKey)
                ) {
                  e.preventDefault();
                  attemptSave(localHours, localNotes, localDiscipline);
                  setNotesOpen(false);

                  const rowEl = e.currentTarget.closest("tr");
                  if (rowEl) {
                    const inputs = Array.from(
                      rowEl.querySelectorAll(
                        'input[data-time-entry-hours="true"]'
                      )
                    ) as HTMLInputElement[];
                    const myInput = e.currentTarget.querySelector(
                      'input[data-time-entry-hours="true"]'
                    ) as HTMLInputElement;
                    const currentIndex = inputs.indexOf(myInput);

                    if (currentIndex !== -1) {
                      const nextIndex =
                        e.key === "ArrowLeft"
                          ? currentIndex - 1
                          : currentIndex + 1;
                      if (nextIndex >= 0 && nextIndex < inputs.length) {
                        const nextInput = inputs[nextIndex];
                        nextInput.focus();
                        nextInput.select();
                      } else {
                        (document.activeElement as HTMLElement)?.blur();
                      }
                    }
                  }
                }

                if (e.key === "Enter" && !inPopover) {
                  e.preventDefault();
                  attemptSave(localHours, localNotes, localDiscipline);
                  setNotesOpen(false);
                  (document.activeElement as HTMLElement)?.blur();
                }

                if (e.key === "Escape") {
                  setNotesOpen(false);
                  (document.activeElement as HTMLElement)?.blur();
                }
              }}
              ref={cellRef}
            >
              <NumberStepper
                allowEmpty
                className="h-7 w-full lg:h-9"
                data-time-entry-hours="true"
                inputClassName="text-center text-xs lg:text-sm"
                inputValue={displayValue}
                max={24}
                min={0}
                onChange={(value) => setLocalHours(String(value))}
                onFocus={(e) => {
                  e.target.select();
                  setNotesOpen(true);
                }}
                onInputValueChange={(value) => setLocalHours(value)}
                showButtons={false}
                step={0.25}
                stepLarge={1}
                value={Number.parseFloat(displayValue) || 0}
              />

              {hasNotes ? (
                <Button
                  className="absolute -top-1 -right-1 z-10 h-5 w-5 p-0 hover:bg-primary/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotesOpen(true);
                  }}
                  size="icon"
                  variant="ghost"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                </Button>
              ) : null}

              {/* Detail panel (notes + discipline + move/delete) */}
              {notesOpen ? (
                <div className="notes-popover absolute left-1/2 z-50 mt-1 max-h-[500px] w-80 -translate-x-1/2 overflow-y-auto rounded-md border bg-card p-3 text-card-foreground shadow-md">
                  <NotesPopover
                    disciplines={ctx.disciplines}
                    entry={entry}
                    notesDisciplineOpen={disciplinePickerOpen}
                    notesEntryDiscipline={localDiscipline}
                    notesInput={localNotes}
                    onClose={() => {
                      setNotesOpen(false);
                      setLocalNotes(entry?.notes ?? "");
                      setLocalDiscipline(entry?.discipline ?? "NONE");
                    }}
                    onDelete={() => {
                      setNotesOpen(false);
                      onDelete();
                    }}
                    onMove={() => entry && ctx.onOpenMoveMode(entry)}
                    onSave={() => {
                      setNotesOpen(false);
                      attemptSave(localHours, localNotes, localDiscipline);
                    }}
                    setNotesDisciplineOpen={setDisciplinePickerOpen}
                    setNotesEntryDiscipline={setLocalDiscipline}
                    setNotesInput={setLocalNotes}
                  />
                </div>
              ) : null}

              {/* Move entry modal dialog */}
              <Dialog
                onOpenChange={(open) => {
                  if (!open) {
                    ctx.setMoveMode(null);
                  }
                }}
                open={ctx.moveMode === entry?.id}
              >
                <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{t("moveEntry")}</DialogTitle>
                  </DialogHeader>
                  {ctx.moveMode === entry?.id ? (
                    <div className="p-4">
                      <MoveEntryDialog
                        allProjects={ctx.allProjects}
                        disciplines={ctx.disciplines}
                        moveDate={ctx.moveDate}
                        moveDiscipline={ctx.moveDiscipline}
                        movePhase={ctx.movePhase}
                        movePhases={ctx.movePhases}
                        moveProject={ctx.moveProject}
                        moveProjectComboOpen={ctx.moveProjectComboOpen}
                        moveTask={ctx.moveTask}
                        moveTasks={ctx.moveTasks}
                        moveUser={ctx.moveUser}
                        onCancel={() => ctx.setMoveMode(null)}
                        onMove={async () => {
                          if (entry) {
                            await ctx.onMoveEntry(entry);
                          }
                          ctx.setMoveMode(null);
                        }}
                        projectSelectionEnabled={ctx.projectSelectionEnabled}
                        setMoveDate={ctx.setMoveDate}
                        setMoveDiscipline={ctx.setMoveDiscipline}
                        setMovePhase={ctx.setMovePhase}
                        setMoveProject={ctx.setMoveProject}
                        setMoveProjectComboOpen={ctx.setMoveProjectComboOpen}
                        setMoveTask={ctx.setMoveTask}
                        setMoveUser={ctx.setMoveUser}
                        showUserSelect={ctx.showUserSelect}
                        users={ctx.users}
                      />
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>
            </div>
          </TooltipTrigger>
          {hasNotes ? (
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{localNotes}</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}
