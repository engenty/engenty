// Inline selector sub-components for the new-task-dialog footer/body pills.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@engenty/ui-core";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  FolderKanban,
  Minus,
  Target,
} from "lucide-react";
import type {
  Goal,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { resolveTaskStatusDotTone } from "../lib/task-status-styles.js";
import type { TaskAssigneeValue } from "./task-assignee-picker.js";
import { getInitials } from "./task-assignee-picker.js";

// ── Priority icon/color lookup ────────────────────────────────────────
export const PRIORITY_META: Record<
  TaskPriority,
  { icon: typeof Minus; className: string }
> = {
  critical: { icon: AlertTriangle, className: "text-red-500" },
  high: { icon: ArrowUp, className: "text-orange-500" },
  medium: { icon: Minus, className: "text-yellow-500" },
  low: { icon: ArrowDown, className: "text-blue-500" },
};

export const PRIORITY_ORDER: TaskPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

// Shared pill button style
export const pillClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors cursor-pointer";

// ── Assignee Pill ─────────────────────────────────────────────────────
interface AssigneePillProps {
  assignee: TaskAssigneeValue;
  label: string | null;
}

export function AssigneePillContent({ assignee, label }: AssigneePillProps) {
  const { t } = useTranslation("tasks");
  if (assignee.primary_assignee_kind === "none") {
    return (
      <span className="text-muted-foreground">
        {t("newTask.assigneePlaceholder")}
      </span>
    );
  }
  if (assignee.primary_assignee_kind === "agent") {
    return (
      <>
        <Bot className="h-3 w-3 text-muted-foreground" />
        <span className="max-w-[120px] truncate">{label}</span>
      </>
    );
  }
  return (
    <>
      <Avatar className="h-4 w-4">
        <AvatarFallback className="bg-primary text-[8px] text-primary-foreground">
          {getInitials(label ?? "")}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[120px] truncate">{label}</span>
    </>
  );
}

// ── Goal Pill + Popover Content ───────────────────────────────────────
interface GoalSelectorProps {
  goalId: string | null;
  goals: Goal[];
  onSelect: (id: string | null) => void;
}

export function GoalSelectorContent({
  goalId,
  goals,
  onSelect,
}: GoalSelectorProps) {
  const { t } = useTranslation("tasks");
  return (
    <Command className="bg-transparent">
      <CommandInput placeholder={t("newTask.searchGoals")} />
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>{t("newTask.noGoalMatch")}</CommandEmpty>
        <CommandGroup>
          <CommandItem
            className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
            onSelect={() => onSelect(null)}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="text-muted-foreground">
                {t("newTask.noGoal")}
              </span>
            </div>
            {!goalId && <Check className="h-4 w-4 shrink-0 text-foreground" />}
          </CommandItem>
          {goals.map((g) => (
            <CommandItem
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
              key={g.id}
              onSelect={() => onSelect(g.id)}
              value={g.title.toLowerCase()}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="truncate">{g.title}</span>
              </div>
              {goalId === g.id && (
                <Check className="h-4 w-4 shrink-0 text-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

// ── Project Selector ──────────────────────────────────────────────────
interface ProjectSelectorProps {
  onSelect: (id: string | null) => void;
  projectId: string | null;
  projects: { id: string; title: string }[];
}

export function ProjectSelectorContent({
  projectId,
  projects,
  onSelect,
}: ProjectSelectorProps) {
  const { t } = useTranslation("tasks");
  return (
    <Command className="bg-transparent">
      <CommandInput placeholder={t("newTask.searchProjects")} />
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>{t("newTask.noProjectMatch")}</CommandEmpty>
        <CommandGroup>
          <CommandItem
            className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
            onSelect={() => onSelect(null)}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="text-muted-foreground">
                {t("newTask.noProject")}
              </span>
            </div>
            {!projectId && (
              <Check className="h-4 w-4 shrink-0 text-foreground" />
            )}
          </CommandItem>
          {projects.map((p) => (
            <CommandItem
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
              key={p.id}
              onSelect={() => onSelect(p.id)}
              value={p.title.toLowerCase()}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="truncate">{p.title}</span>
              </div>
              {projectId === p.id && (
                <Check className="h-4 w-4 shrink-0 text-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

// ── Status Selector ───────────────────────────────────────────────────
interface StatusSelectorProps {
  defs: TaskStatusDefinition[];
  onSelect: (id: string) => void;
  status: string;
}

export function StatusSelectorContent({
  defs,
  status,
  onSelect,
}: StatusSelectorProps) {
  return (
    <>
      {defs.map((d) => (
        <button
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
          key={d.id}
          onClick={() => onSelect(d.id)}
          type="button"
        >
          <span
            className={`h-2 w-2 rounded-full ${resolveTaskStatusDotTone(d.color)}`}
          />
          <span className="flex-1 text-left">{d.label}</span>
          {status === d.id && <Check className="h-4 w-4 text-foreground" />}
        </button>
      ))}
    </>
  );
}

// ── Priority Selector ─────────────────────────────────────────────────
interface PrioritySelectorProps {
  onSelect: (p: TaskPriority) => void;
  priority: TaskPriority;
}

export function PrioritySelectorContent({
  priority,
  onSelect,
}: PrioritySelectorProps) {
  const { t } = useTranslation("tasks");
  return (
    <>
      {PRIORITY_ORDER.map((p) => {
        const meta = PRIORITY_META[p];
        const Icon = meta.icon;
        return (
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            key={p}
            onClick={() => onSelect(p)}
            type="button"
          >
            <Icon className={`h-3.5 w-3.5 ${meta.className}`} />
            <span className="flex-1 text-left">{t(`priority.${p}`)}</span>
            {priority === p && (
              <Check className="h-3.5 w-3.5 text-foreground" />
            )}
          </button>
        );
      })}
    </>
  );
}
