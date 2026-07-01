import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { ArrowRightLeft, Check, Tag, Trash2 } from "lucide-react";
import type { Discipline } from "./types.js";

// Inline chip-chooser styling, matching the tasks "New Task" dialog pills.
const pillClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors cursor-pointer";

interface NotesPopoverProps {
  disciplines: Discipline[];
  entry: { id: string } | undefined;
  notesDisciplineOpen: boolean;
  notesEntryDiscipline: string;
  notesInput: string;
  onClose: () => void;
  onDelete: () => void;
  onMove: () => void;
  onSave: () => void;
  setNotesDisciplineOpen: (open: boolean) => void;
  setNotesEntryDiscipline: (discipline: string) => void;
  setNotesInput: (notes: string) => void;
}

export function NotesPopover({
  notesInput,
  setNotesInput,
  notesEntryDiscipline,
  setNotesEntryDiscipline,
  notesDisciplineOpen,
  setNotesDisciplineOpen,
  disciplines,
  entry,
  onSave,
  onDelete,
  onMove,
  onClose,
}: NotesPopoverProps) {
  const { t } = useTranslation("time-tracking");

  const hasDiscipline = Boolean(
    notesEntryDiscipline && notesEntryDiscipline !== "NONE"
  );
  const selectedDiscipline = disciplines.find(
    (discipline) => discipline.name === notesEntryDiscipline
  );

  return (
    <div className="space-y-2">
      <textarea
        className="min-h-[88px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        onChange={(e) => setNotesInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={t("notesPlaceholder")}
        value={notesInput}
      />
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <Popover
          modal
          onOpenChange={setNotesDisciplineOpen}
          open={notesDisciplineOpen}
        >
          <PopoverTrigger asChild>
            <button className={pillClass} type="button">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {selectedDiscipline ? (
                <span className="max-w-[160px] truncate">
                  {selectedDiscipline.name} ({selectedDiscipline.short})
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("disciplineOptional")}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0">
            <Command>
              <CommandInput
                className="text-xs"
                placeholder={t("disciplineOptional")}
              />
              <CommandList>
                <CommandEmpty className="py-3 text-center text-muted-foreground text-xs">
                  {t("none")}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setNotesEntryDiscipline("NONE");
                      setNotesDisciplineOpen(false);
                    }}
                    value={t("none")}
                  >
                    <span className="flex-1 text-xs">{t("none")}</span>
                    {hasDiscipline ? null : <Check className="h-3.5 w-3.5" />}
                  </CommandItem>
                  {disciplines.map((discipline) => (
                    <CommandItem
                      key={discipline.name}
                      onSelect={() => {
                        setNotesEntryDiscipline(discipline.name);
                        setNotesDisciplineOpen(false);
                      }}
                      value={`${discipline.name} ${discipline.short}`}
                    >
                      <span className="flex-1 text-xs">
                        {discipline.name}{" "}
                        <span className="text-muted-foreground">
                          ({discipline.short})
                        </span>
                      </span>
                      {notesEntryDiscipline === discipline.name ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {entry ? (
          <div className="flex gap-1">
            <Button
              className="h-7 w-7 p-0"
              onClick={onDelete}
              size="sm"
              variant="destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              className="h-7 w-7 p-0"
              onClick={onMove}
              size="sm"
              variant="outline"
            >
              <ArrowRightLeft className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between pt-2">
        <p className="text-muted-foreground text-xxs">{t("notesHotkeys")}</p>
        <Button onClick={onSave} size="sm">
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
