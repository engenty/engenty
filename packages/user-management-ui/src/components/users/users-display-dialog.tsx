import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuContent,
  DropdownMenuSeparator,
  Switch,
} from "@engenty/ui-core";
import { Eye, EyeOff, GripVertical, Minus } from "lucide-react";
import { useMemo } from "react";
import type { UserTableColumnConfig } from "./columns.js";
import type { UserColumnVisibility } from "./types.js";

interface UsersDisplayDialogProps {
  columnOrder: string[];
  columns: UserTableColumnConfig[];
  columnVisibility: UserColumnVisibility;
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (value: UserColumnVisibility) => void;
  setTableSize: (size: "compact" | "normal") => void;
  tableSize: "compact" | "normal";
}

function SortableColumnItem(props: {
  column: UserTableColumnConfig;
  isVisible: boolean;
  isLastVisible: boolean;
  onToggle: () => void;
  translateLabel: (column: UserTableColumnConfig) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.column.key,
    disabled: !props.isVisible || props.isLastVisible,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const Icon = props.column.icon;
  const canDrag = props.isVisible && !props.isLastVisible;
  const label = props.translateLabel(props.column);
  return (
    <div
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
      ref={setNodeRef}
      style={style}
    >
      {canDrag ? (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/50 active:cursor-grabbing group-hover:text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      ) : (
        <div className="text-muted-foreground/30">
          <Minus className="h-4 w-4" />
        </div>
      )}
      {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
      <span className="flex-1 text-sm">{label}</span>
      {!props.isLastVisible && (
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={props.onToggle}
          type="button"
        >
          {props.isVisible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 opacity-50" />
          )}
        </button>
      )}
    </div>
  );
}

export function UsersDisplayDialog({
  columns,
  tableSize,
  setTableSize,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
}: UsersDisplayDialogProps) {
  const { t } = useTranslation("common");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  const columnConfigs = useMemo(() => columns, [columns]);
  const visibleColumns = columnOrder
    .map((key) => columnConfigs.find((col) => col.key === key))
    .filter((col): col is UserTableColumnConfig =>
      Boolean(col && columnVisibility[col.key])
    );
  const hiddenColumns = columnConfigs.filter(
    (col) => !columnVisibility[col.key]
  );
  const translateLabel = (column: UserTableColumnConfig) =>
    column.labelKey ? t(column.labelKey) : column.label;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = columnOrder.indexOf(active.id as string);
    const newIndex = columnOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const next = [...columnOrder];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, active.id as string);
    setColumnOrder(next);
  };

  const toggleColumn = (key: string) => {
    const currentlyVisibleCount =
      Object.values(columnVisibility).filter(Boolean).length;
    if (columnVisibility[key] && currentlyVisibleCount === 1) {
      return;
    }
    setColumnVisibility({
      ...columnVisibility,
      [key]: !columnVisibility[key],
    });
  };

  return (
    <DropdownMenuContent align="end" className="w-[300px]">
      <div className="px-2 py-1.5">
        <div className="flex items-center justify-between">
          <label
            className="cursor-pointer font-medium text-sm"
            htmlFor="compact-view"
          >
            Compact view
          </label>
          <Switch
            checked={tableSize === "compact"}
            id="compact-view"
            onCheckedChange={(checked) =>
              setTableSize(checked ? "compact" : "normal")
            }
          />
        </div>
      </div>
      <DropdownMenuSeparator />
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <div className="px-2 py-1.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-muted-foreground text-xs">
              Displayed columns
            </p>
          </div>
          <SortableContext
            items={visibleColumns.map((c) => c.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {visibleColumns.map((column) => (
                <SortableColumnItem
                  column={column}
                  isLastVisible={visibleColumns.length === 1}
                  isVisible
                  key={column.key}
                  onToggle={() => toggleColumn(column.key)}
                  translateLabel={translateLabel}
                />
              ))}
            </div>
          </SortableContext>
        </div>
        {hiddenColumns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="space-y-0.5 px-2 py-1.5">
              <p className="mb-2 font-medium text-muted-foreground text-xs">
                Hidden columns
              </p>
              {hiddenColumns.map((column) => {
                const Icon = column.icon;
                const label = translateLabel(column);
                return (
                  <div
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    key={column.key}
                  >
                    <div className="text-muted-foreground/30">
                      <Minus className="h-4 w-4" />
                    </div>
                    {Icon ? (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    ) : null}
                    <span className="flex-1 text-sm">{label}</span>
                    <button
                      aria-label={`Show ${label} column`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggleColumn(column.key)}
                      type="button"
                    >
                      <EyeOff className="h-4 w-4 opacity-50" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DndContext>
    </DropdownMenuContent>
  );
}
