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
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Eye,
  EyeOff,
  GripVertical,
  Kanban,
  LayoutGrid,
  List,
  Minus,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { LIST_PAGE_SIZE_OPTIONS, type ListPageSize } from "./list-page-size.js";

export type ViewMode = "table" | "cards" | "kanban";
export type TableSize = "compact" | "normal";
export type SortOrder = "asc" | "desc";

export interface ColumnConfig<TKey extends string = string> {
  /** Optional Lucide icon; defaults to `List` when omitted. */
  icon?: ComponentType<{ className?: string }>;
  key: TKey;
  label: string;
}

export interface ListDisplayConfiguratorProps<
  TColumnKey extends string = string,
  TSortColumn extends string = string,
> {
  columnOrder: TColumnKey[];
  // Columns
  columns: ColumnConfig<TColumnKey>[];
  columnVisibility: Record<TColumnKey, boolean>;
  groupBy?: string;
  groupByOptions?: { value: string; label: string }[];
  // i18n / Labels
  labels: {
    table: string;
    cards: string;
    kanban?: string;
    /** @deprecated Compact-rows toggle removed from the display menu. */
    compactView?: string;
    sortBy: string;
    ascending?: string;
    descending?: string;
    displayedInTable: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
    itemsPerPage?: string;
    groupBy?: string;
  };
  pageSize?: ListPageSize;
  setColumnOrder: (order: TColumnKey[]) => void;
  setColumnVisibility: (value: Record<TColumnKey, boolean>) => void;
  setGroupBy?: (value: string) => void;
  setPageSize?: (size: ListPageSize) => void;
  setSortBy: (column: TSortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  /** @deprecated Compact-rows toggle removed; prop kept for call-site compatibility. */
  setTableSize?: (size: TableSize) => void;
  setViewMode?: (mode: ViewMode) => void;
  // Sorting
  sortBy: TSortColumn;
  sortOptions: { value: TSortColumn; label: string }[];
  sortOrder: SortOrder;
  /** @deprecated Compact-rows toggle removed; prop kept for call-site compatibility. */
  tableSize?: TableSize;
  // View Mode
  viewMode?: ViewMode;
  /** When provided, only these view modes are shown. Default ["table", "cards"]. */
  viewModes?: ("table" | "cards" | "kanban")[];
}

interface SortableColumnItemProps<TColumnKey extends string> {
  column: ColumnConfig<TColumnKey>;
  isLastVisible: boolean;
  isVisible: boolean;
  onToggle: () => void;
}

function SortableColumnItem<TColumnKey extends string>({
  column,
  isVisible,
  isLastVisible,
  onToggle,
}: SortableColumnItemProps<TColumnKey>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.key,
    disabled: !isVisible || isLastVisible,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = column.icon ?? List;
  const canDrag = isVisible && !isLastVisible;

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
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm">{column.label}</span>
      {!isLastVisible && (
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={onToggle}
          type="button"
        >
          {isVisible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 opacity-50" />
          )}
        </button>
      )}
    </div>
  );
}

export function ListDisplayConfigurator<
  TColumnKey extends string = string,
  TSortColumn extends string = string,
>({
  viewMode,
  setViewMode,
  viewModes = ["table", "cards"],
  pageSize,
  setPageSize,
  groupBy,
  setGroupBy,
  groupByOptions,
  columns,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  sortBy,
  setSortBy,
  sortOptions,
  sortOrder,
  setSortOrder,
  labels,
}: ListDisplayConfiguratorProps<TColumnKey, TSortColumn>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const visibleColumns = columnOrder
    .map((key) => columns.find((c) => c.key === key))
    .filter(
      (col): col is ColumnConfig<TColumnKey> =>
        col !== undefined && columnVisibility[col.key]
    );

  const hiddenColumns = columns.filter((col) => !columnVisibility[col.key]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = columnOrder.indexOf(active.id as TColumnKey);
    const newIndex = columnOrder.indexOf(over.id as TColumnKey);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...columnOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as TColumnKey);
      setColumnOrder(newOrder);
    }
  };

  const handleShowAll = () => {
    const allVisible = {} as Record<TColumnKey, boolean>;
    for (const col of columns) {
      allVisible[col.key] = true;
    }
    setColumnVisibility(allVisible);
    const allKeys = columns.map((c) => c.key);
    const newOrder = [...new Set([...columnOrder, ...allKeys])];
    setColumnOrder(newOrder);
  };

  const handleHideAll = () => {
    const currentlyVisibleCount =
      Object.values(columnVisibility).filter(Boolean).length;
    if (currentlyVisibleCount <= 1) {
      return;
    }

    const firstVisibleKey = Object.entries(columnVisibility).find(
      ([_, visible]) => visible
    )?.[0] as TColumnKey;
    const allHidden = {} as Record<TColumnKey, boolean>;
    for (const col of columns) {
      allHidden[col.key] = false;
    }
    if (firstVisibleKey) {
      allHidden[firstVisibleKey] = true;
    }
    setColumnVisibility(allHidden);
  };

  const handleToggleColumn = (key: TColumnKey) => {
    const currentlyVisibleCount =
      Object.values(columnVisibility).filter(Boolean).length;
    if (columnVisibility[key] && currentlyVisibleCount === 1) {
      return;
    }

    setColumnVisibility({ ...columnVisibility, [key]: !columnVisibility[key] });
    if (!(columnVisibility[key] || columnOrder.includes(key))) {
      setColumnOrder([...columnOrder, key]);
    }
  };

  return (
    <DropdownMenuContent
      align="end"
      className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 pb-2"
    >
      {viewMode != null && setViewMode && viewModes.length > 0 && (
        <div className="px-2 pt-2 pb-1">
          <div
            className="grid w-full gap-1 rounded-md"
            style={{
              gridTemplateColumns: `repeat(${viewModes.length}, minmax(0, 1fr))`,
            }}
          >
            {viewModes.includes("table") && (
              <Button
                className="h-auto w-full min-w-0 flex-col items-center gap-1 rounded-lg py-2 shadow-none hover:bg-muted/80"
                onClick={() => setViewMode("table")}
                size="sm"
                variant={viewMode === "table" ? "secondary" : "ghost"}
              >
                <List
                  className={cn(
                    "h-4 w-4",
                    viewMode === "table"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs",
                    viewMode === "table"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {labels.table}
                </span>
              </Button>
            )}
            {viewModes.includes("cards") && (
              <Button
                className="h-auto w-full min-w-0 flex-col items-center gap-1 rounded-lg py-2 shadow-none hover:bg-muted/80"
                onClick={() => setViewMode("cards")}
                size="sm"
                variant={viewMode === "cards" ? "secondary" : "ghost"}
              >
                <LayoutGrid
                  className={cn(
                    "h-4 w-4",
                    viewMode === "cards"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs",
                    viewMode === "cards"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {labels.cards}
                </span>
              </Button>
            )}
            {viewModes.includes("kanban") && labels.kanban && (
              <Button
                className="h-auto w-full min-w-0 flex-col items-center gap-1 rounded-lg py-2 shadow-none hover:bg-muted/80"
                onClick={() => setViewMode("kanban")}
                size="sm"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
              >
                <Kanban
                  className={cn(
                    "h-4 w-4",
                    viewMode === "kanban"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs",
                    viewMode === "kanban"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {labels.kanban}
                </span>
              </Button>
            )}
          </div>
        </div>
      )}

      {pageSize != null && setPageSize && labels.itemsPerPage && (
        <>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                className="text-muted-foreground text-sm"
                htmlFor="items-per-page"
              >
                {labels.itemsPerPage}
              </label>
              <Select
                onValueChange={(value) => {
                  if (value == null) {
                    return;
                  }
                  setPageSize(Number.parseInt(value, 10) as ListPageSize);
                }}
                value={String(pageSize)}
              >
                <SelectTrigger
                  className="min-h-8 w-auto shrink-0 text-xs"
                  id="items-per-page"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIST_PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      <DropdownMenuSeparator />
      <div className="px-2 py-1.5">
        <DropdownMenuLabel className="mb-1.5 px-0 py-0 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-wider">
          {labels.sortBy}
        </DropdownMenuLabel>
        <div className="flex items-center gap-1.5">
          <Select
            onValueChange={(value) => setSortBy(value as TSortColumn)}
            value={sortBy}
          >
            <SelectTrigger className="min-h-8 flex-1 text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex shrink-0 gap-0.5 rounded-lg bg-muted/50 p-0.5"
            role="group"
          >
            <Button
              aria-label={labels.ascending ?? "Ascending"}
              aria-pressed={sortOrder === "asc"}
              className="shadow-none"
              onClick={() => setSortOrder("asc")}
              size="icon-sm"
              title={labels.ascending}
              type="button"
              variant={sortOrder === "asc" ? "secondary" : "ghost"}
            >
              <ArrowUpWideNarrow className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={labels.descending ?? "Descending"}
              aria-pressed={sortOrder === "desc"}
              className="shadow-none"
              onClick={() => setSortOrder("desc")}
              size="icon-sm"
              title={labels.descending}
              type="button"
              variant={sortOrder === "desc" ? "secondary" : "ghost"}
            >
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {groupBy != null &&
          setGroupBy &&
          groupByOptions &&
          groupByOptions.length > 0 &&
          labels.groupBy && (
            <div className="mt-3">
              <DropdownMenuLabel className="mb-1.5 px-0 py-0 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                {labels.groupBy}
              </DropdownMenuLabel>
              <Select
                onValueChange={(value) => {
                  if (value == null) {
                    return;
                  }
                  setGroupBy(value);
                }}
                value={groupBy}
              >
                <SelectTrigger className="min-h-8 w-full text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupByOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
      </div>

      {viewMode !== "kanban" && columns.length > 0 && (
        <>
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
                  {labels.displayedInTable}
                </p>
                {visibleColumns.length > 1 && (
                  <button
                    className="text-link text-xs hover:underline"
                    onClick={handleHideAll}
                    type="button"
                  >
                    {labels.hideAll}
                  </button>
                )}
              </div>
              {visibleColumns.length > 0 ? (
                <SortableContext
                  items={visibleColumns.map((c) => c.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {visibleColumns.map((column) => (
                      <SortableColumnItem
                        column={column}
                        isLastVisible={visibleColumns.length === 1}
                        isVisible={true}
                        key={column.key}
                        onToggle={() => handleToggleColumn(column.key)}
                      />
                    ))}
                  </div>
                </SortableContext>
              ) : (
                <p className="py-2 text-muted-foreground text-xs">
                  {labels.noColumnsDisplayed}
                </p>
              )}
            </div>

            {hiddenColumns.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium text-muted-foreground text-xs">
                      {labels.hiddenInTable}
                    </p>
                    <button
                      className="text-link text-xs hover:underline"
                      onClick={handleShowAll}
                      type="button"
                    >
                      {labels.showAll}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {hiddenColumns.map((column) => (
                      <div
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                        key={column.key}
                      >
                        <div className="text-muted-foreground/30">
                          <Minus className="h-4 w-4" />
                        </div>
                        {(() => {
                          const Icon = column.icon ?? List;
                          return (
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          );
                        })()}
                        <span className="flex-1 text-sm">{column.label}</span>
                        <button
                          aria-label={labels.showAll}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => handleToggleColumn(column.key)}
                          type="button"
                        >
                          <EyeOff className="h-4 w-4 opacity-50" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </DndContext>
        </>
      )}
    </DropdownMenuContent>
  );
}
