import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Plus, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectListItem, ProjectTaskStatusDefinition } from "../api.js";
import type { getProjectsTasksToolbarLabels } from "../lib/projects-tasks-toolbar-labels.js";
import type {
  ProjectsTasksColumnVisibility,
  ProjectsTasksSortColumn,
  ProjectsTasksViewMode,
  TableSize,
  TaskColumnOption,
} from "./projects-tasks-display-dialog.js";
import { ProjectsTasksDisplayDialog } from "./projects-tasks-display-dialog.js";

function ScopeSegmentButton({
  pressed,
  className,
  onClick,
  children,
}: {
  pressed: boolean;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return pressed ? (
    <button
      aria-pressed="true"
      className={className}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ) : (
    <button
      aria-pressed="false"
      className={className}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

interface ProjectsTasksToolbarProps {
  columnOrder: (keyof ProjectsTasksColumnVisibility)[];
  columns: TaskColumnOption[];
  columnVisibility: ProjectsTasksColumnVisibility;
  labels: ReturnType<typeof getProjectsTasksToolbarLabels>;
  onAddTask?: () => void;
  onProjectFilterChange: (projectId: string) => void;
  onScopeChange: (scope: "mine" | "all") => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: string | "all") => void;
  projectFilter: string;
  projects: ProjectListItem[];
  scope: "mine" | "all";
  searchQuery: string;
  setColumnOrder: (order: (keyof ProjectsTasksColumnVisibility)[]) => void;
  setColumnVisibility: (value: ProjectsTasksColumnVisibility) => void;
  setSortBy: (column: ProjectsTasksSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  setTableSize?: (size: TableSize) => void;
  setViewMode: (mode: ProjectsTasksViewMode) => void;
  sortBy: ProjectsTasksSortColumn;
  sortOptions: { value: ProjectsTasksSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
  statusFilter: string | "all";
  statusFilterOptions: ProjectTaskStatusDefinition[];
  tableSize?: TableSize;
  viewMode: ProjectsTasksViewMode;
}

export function ProjectsTasksToolbar({
  scope,
  onScopeChange,
  searchQuery,
  onSearchChange,
  projectFilter,
  onProjectFilterChange,
  projects,
  statusFilter,
  statusFilterOptions,
  onStatusFilterChange,
  labels,
  viewMode,
  setViewMode,
  tableSize,
  setTableSize,
  columnOrder,
  columnVisibility,
  setColumnOrder,
  setColumnVisibility,
  columns,
  sortBy,
  setSortBy,
  sortOptions,
  sortOrder,
  setSortOrder,
  onAddTask,
}: ProjectsTasksToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-md border">
        <ScopeSegmentButton
          className={`rounded-l-md px-2.5 py-1.5 font-medium text-xs transition-colors ${scope === "mine" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          onClick={() => onScopeChange("mine")}
          pressed={scope === "mine"}
        >
          {labels.scopeMine}
        </ScopeSegmentButton>
        <ScopeSegmentButton
          className={`rounded-r-md border-l px-2.5 py-1.5 font-medium text-xs transition-colors ${scope === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          onClick={() => onScopeChange("all")}
          pressed={scope === "all"}
        >
          {labels.scopeAll}
        </ScopeSegmentButton>
      </div>

      <Input
        className="h-9 max-w-[200px]"
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={labels.searchPlaceholder}
        value={searchQuery}
      />

      <Select
        onValueChange={(v) => onProjectFilterChange(v === "__all__" ? "" : v)}
        value={projectFilter || "__all__"}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder={labels.filterProject}>
            {projectFilter
              ? (projects.find((p) => p.id === projectFilter)?.title ??
                projectFilter)
              : labels.filterProject}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{labels.filterProject}</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => onStatusFilterChange(v === "all" ? "all" : v)}
        value={statusFilter}
      >
        <SelectTrigger className="h-9 min-w-[9rem]">
          <SelectValue placeholder={labels.filterAllStatuses}>
            {statusFilter === "all"
              ? labels.filterAllStatuses
              : (statusFilterOptions.find((d) => d.id === statusFilter)
                  ?.label ?? statusFilter)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.filterAllStatuses}</SelectItem>
          {statusFilterOptions.map((def) => (
            <SelectItem key={def.id} value={def.id}>
              {def.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-muted-foreground text-xs">
        {labels.paginationSummary}
      </p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="ml-auto gap-1.5" size="sm" variant="outline">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {labels.display}
          </Button>
        </DropdownMenuTrigger>
        <ProjectsTasksDisplayDialog
          columnOrder={columnOrder}
          columns={columns}
          columnVisibility={columnVisibility}
          labels={labels}
          setColumnOrder={setColumnOrder}
          setColumnVisibility={setColumnVisibility}
          setSortBy={setSortBy}
          setSortOrder={setSortOrder}
          setTableSize={setTableSize}
          setViewMode={setViewMode}
          sortBy={sortBy}
          sortOptions={sortOptions}
          sortOrder={sortOrder}
          tableSize={tableSize}
          viewMode={viewMode}
        />
      </DropdownMenu>

      {onAddTask && (
        <Button onClick={onAddTask} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {labels.addTask}
        </Button>
      )}
    </div>
  );
}
