import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { GripVertical, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { BUILTIN_TASK_STATUS_IDS } from "../../task-status-builtins.js";
import {
  type ProjectTaskStatusDefinition,
  TASK_STATUS_COLOR_OPTIONS,
  type TaskStatusColor,
} from "../api.js";
import { TASK_STATUS_FILLS } from "../lib/task-status-styles.js";

export interface TaskStatusSettingsSortableRowProps {
  autoFocus?: boolean;
  index: number;
  onColorChange: (color: TaskStatusColor) => void;
  onEnter: () => void;
  onMove: (dir: "up" | "down") => void;
  onNavigate: (col: "key" | "label", dir: "up" | "down") => void;
  onRemove: () => void;
  row: ProjectTaskStatusDefinition;
  updateRow: (idx: number, patch: Partial<ProjectTaskStatusDefinition>) => void;
}

export function TaskStatusSettingsSortableRow({
  row,
  index,
  updateRow,
  onRemove,
  onColorChange,
  autoFocus,
  onNavigate,
  onMove,
  onEnter,
}: TaskStatusSettingsSortableRowProps) {
  const { t } = useTranslation("projects");
  const [colorOpen, setColorOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div className="flex items-center gap-1.5" ref={setNodeRef} style={style}>
      <button
        aria-label={t("settings.taskStatusDragRow")}
        className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        className="h-8 w-28 shrink-0 text-sm"
        disabled={row.locked || BUILTIN_TASK_STATUS_IDS.has(row.id)}
        id={`status-key-input-${row.id}`}
        onChange={(e) => {
          const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
          updateRow(index, { id: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("key", "up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("key", "down");
            }
          }
        }}
        placeholder={t("settings.taskStatusesKey")}
        value={row.id}
      />
      <Input
        autoFocus={autoFocus}
        className="h-8 min-w-0 flex-1 text-sm"
        id={`status-label-input-${row.id}`}
        onChange={(e) => updateRow(index, { label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("label", "up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("label", "down");
            }
          }
        }}
        placeholder={t("settings.taskStatusesLabelCol")}
        value={row.label}
      />
      <Popover onOpenChange={setColorOpen} open={colorOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t("settings.taskStatusColorAria", {
              color: t(`settings.taskStatusColor.${row.color}`),
            })}
            className="h-8 w-9 shrink-0 rounded-md p-0"
            type="button"
            variant="ghost"
          >
            <span
              aria-hidden
              className={cn(
                "block h-3.5 w-3.5 rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/15",
                TASK_STATUS_FILLS[row.color]
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2" sideOffset={4}>
          <div className="grid grid-cols-4 gap-1">
            {TASK_STATUS_COLOR_OPTIONS.map((c) => (
              <button
                aria-label={t(`settings.taskStatusColor.${c}`)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted",
                  row.color === c &&
                    "ring-2 ring-ring ring-offset-2 ring-offset-background"
                )}
                key={c}
                onClick={() => {
                  onColorChange(c);
                  setColorOpen(false);
                }}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-3 w-3 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                    TASK_STATUS_FILLS[c]
                  )}
                />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {row.locked ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Button
            className="h-7 w-7 shrink-0"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
