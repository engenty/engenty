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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input } from "@engenty/ui-core";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

export interface TaxonomyTermDraft {
  /** Local key for tracking focus. */
  _tempKey?: string;
  /** Persisted term id — omitted for new drafts. */
  id?: string;
  label: string;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

interface SortableTermRowProps {
  autoFocus?: boolean;
  extraCell?: React.ReactNode;
  onEnter: () => void;
  onLabelChange: (label: string) => void;
  onMove: (dir: "up" | "down") => void;
  onNavigate: (dir: "up" | "down") => void;
  onRemove: () => void;
  /** Stable key used by dnd-kit (id or a draft-index string). */
  sortableId: string;
  term: TaxonomyTermDraft;
}

function SortableTermRow({
  term,
  sortableId,
  onLabelChange,
  onRemove,
  onNavigate,
  onMove,
  onEnter,
  extraCell,
  autoFocus,
}: SortableTermRowProps) {
  const { t } = useTranslation("team");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div
      className={cn("flex items-center gap-1.5", isDragging && "z-50")}
      ref={setNodeRef}
      style={style}
    >
      {/* Drag handle */}
      <button
        aria-label={t("settings.drag_to_reorder")}
        className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Input
        autoFocus={autoFocus}
        className="h-8 min-w-0 flex-1 text-sm"
        id={`term-input-${sortableId}`}
        onChange={(e) => onLabelChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("up");
            } else {
              onNavigate("up");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
              onMove("down");
            } else {
              onNavigate("down");
            }
          }
        }}
        value={term.label}
      />

      {extraCell}

      <Button
        aria-label={t("settings.remove_term")}
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

import { useState } from "react";

export function TeamTaxonomyTermsSection({
  description,
  terms,
  title,
  onChange,
  extraColumn,
}: {
  description: string;
  terms: TaxonomyTermDraft[];
  title: string;
  onChange: (terms: TaxonomyTermDraft[]) => void;
  /** Optional extra header label rendered in the column header row. */
  extraColumn?: React.ReactNode;
}) {
  const { t } = useTranslation("team");
  const [newlyAddedKey, setNewlyAddedKey] = useState<string | null>(null);

  // Stable sortable ids per row (prefer persisted id, fall back to _tempKey, fall back to draft index)
  const sortableIds = useMemo(
    () => terms.map((term, i) => term.id ?? term._tempKey ?? `draft-${i}`),
    [terms]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onChange(arrayMove(terms, oldIndex, newIndex));
  };

  const addTerm = () => {
    const key = crypto.randomUUID();
    setNewlyAddedKey(key);
    onChange([
      ...terms,
      { label: "", sort_order: terms.length, _tempKey: key },
    ]);
  };

  const insertTermBelow = (index: number) => {
    const key = crypto.randomUUID();
    setNewlyAddedKey(key);
    const newTerm: TaxonomyTermDraft = {
      label: "",
      sort_order: terms.length,
      _tempKey: key,
    };
    const updated = [...terms];
    updated.splice(index + 1, 0, newTerm);
    onChange(updated);
  };

  const handleNavigate = (key: string, dir: "up" | "down") => {
    const idx = sortableIds.indexOf(key);
    if (idx < 0) {
      return;
    }
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sortableIds.length) {
      const targetKey = sortableIds[targetIdx];
      document.getElementById(`term-input-${targetKey}`)?.focus();
    }
  };

  const handleMove = (key: string, dir: "up" | "down") => {
    const idx = sortableIds.indexOf(key);
    if (idx < 0) {
      return;
    }
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sortableIds.length) {
      onChange(arrayMove(terms, idx, targetIdx));
    }
  };

  const removeTerm = (index: number) => {
    onChange(terms.filter((_, i) => i !== index));
  };

  const updateLabel = (index: number, label: string) => {
    const updated = [...terms];
    updated[index] = { ...updated[index], label };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
        <p className="text-muted-foreground text-xs">
          {t("settings.term_slug_auto_hint")}
        </p>
      </div>

      <div className="ui-card-panel overflow-hidden">
        <div className="p-4">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <div className="w-full space-y-1.5">
              {/* Column header */}
              <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
                {/* grip placeholder */}
                <div className="w-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  {t("settings.term_name")}
                </span>
                {extraColumn}
                {/* delete placeholder */}
                <div className="w-7 shrink-0" />
              </div>

              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {terms.map((term, index) => (
                  <SortableTermRow
                    autoFocus={sortableIds[index] === newlyAddedKey}
                    extraCell={extraColumn}
                    key={sortableIds[index]}
                    onEnter={() => insertTermBelow(index)}
                    onLabelChange={(label) => updateLabel(index, label)}
                    onMove={(dir) => handleMove(sortableIds[index], dir)}
                    onNavigate={(dir) =>
                      handleNavigate(sortableIds[index], dir)
                    }
                    onRemove={() => removeTerm(index)}
                    sortableId={sortableIds[index]}
                    term={term}
                  />
                ))}
              </SortableContext>

              <Button
                className="h-7 text-xs"
                onClick={addTerm}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.add_term")}
              </Button>
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
