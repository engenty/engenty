import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectTaskStatusDefinition } from "../api.js";
import { TaskStatusSettingsSortableRow } from "./task-statuses-settings-sortable-row.js";

interface TaskStatusesSettingsSectionProps {
  onDefinitionsChange: (definitions: ProjectTaskStatusDefinition[]) => void;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
}

export function TaskStatusesSettingsSection({
  taskStatusDefinitions,
  onDefinitionsChange,
}: TaskStatusesSettingsSectionProps) {
  const { t } = useTranslation("projects");
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

  const sortableIds = useMemo(
    () => taskStatusDefinitions.map((d) => d.id),
    [taskStatusDefinitions]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  );

  const updateRow = (
    index: number,
    patch: Partial<ProjectTaskStatusDefinition>
  ) => {
    const next = [...taskStatusDefinitions];
    next[index] = { ...next[index], ...patch };
    onDefinitionsChange(next);
  };

  const removeRow = (index: number) => {
    const row = taskStatusDefinitions[index];
    if (row?.locked) {
      return;
    }
    onDefinitionsChange(taskStatusDefinitions.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const id = `extra_${Date.now()}`;
    setNewlyAddedId(id);
    onDefinitionsChange([
      ...taskStatusDefinitions,
      { id, label: "", color: "slate", locked: false },
    ]);
  };

  const insertRowBelow = (index: number) => {
    const id = `extra_${Date.now()}`;
    setNewlyAddedId(id);
    const newRow: ProjectTaskStatusDefinition = {
      id,
      label: "",
      color: "slate",
      locked: false,
    };
    const next = [...taskStatusDefinitions];
    next.splice(index + 1, 0, newRow);
    onDefinitionsChange(next);
  };

  const handleNavigate = (
    idx: number,
    col: "key" | "label",
    dir: "up" | "down"
  ) => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < taskStatusDefinitions.length) {
      const target = taskStatusDefinitions[targetIdx];
      if (col === "key") {
        const keyInput = document.getElementById(
          `status-key-input-${target.id}`
        ) as HTMLInputElement | null;
        if (keyInput && !keyInput.disabled) {
          keyInput.focus();
          return;
        }
      }
      document.getElementById(`status-label-input-${target.id}`)?.focus();
    }
  };

  const handleMove = (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < taskStatusDefinitions.length) {
      onDefinitionsChange(arrayMove(taskStatusDefinitions, idx, targetIdx));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = taskStatusDefinitions.findIndex((d) => d.id === active.id);
    const newIndex = taskStatusDefinitions.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onDefinitionsChange(arrayMove(taskStatusDefinitions, oldIndex, newIndex));
  };

  return (
    <div className="w-full space-y-3">
      <div>
        <h3 className="font-semibold text-base">
          {t("settings.taskStatusesTitle")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("settings.taskStatusesDesc")}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="p-4">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <div className="w-full space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
                <div className="w-7 shrink-0" />
                <span className="w-28 shrink-0">
                  {t("settings.taskStatusesKey")}
                </span>
                <span className="min-w-0 flex-1">
                  {t("settings.taskStatusesLabelCol")}
                </span>
                <span className="flex w-9 shrink-0 justify-center">
                  {t("settings.taskStatusesColor")}
                </span>
                <div className="w-7 shrink-0" />
              </div>
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {taskStatusDefinitions.map((row, index) => (
                  <TaskStatusSettingsSortableRow
                    autoFocus={row.id === newlyAddedId}
                    index={index}
                    key={row.id}
                    onColorChange={(c) => updateRow(index, { color: c })}
                    onEnter={() => insertRowBelow(index)}
                    onMove={(dir) => handleMove(index, dir)}
                    onNavigate={(col, dir) => handleNavigate(index, col, dir)}
                    onRemove={() => removeRow(index)}
                    row={row}
                    updateRow={updateRow}
                  />
                ))}
              </SortableContext>
              <Button
                className="h-7 text-xs"
                onClick={addRow}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.addTaskStatus")}
              </Button>
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
