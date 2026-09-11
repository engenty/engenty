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
  Layers,
  Minus,
} from "lucide-react";
import type {
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

// ── New-task dialog form chrome ───────────────────────────────────────
// The dialog reads top-to-bottom as a form, not as a sentence of pills: a
// small-caps section label, then full-width rows whose VALUE sits in the
// foreground. Muted is reserved for placeholders and consequence hints, so
// "nothing chosen yet" is visually distinct from "this is what will happen".
export const sectionLabelClass =
  "font-medium text-[11px] text-muted-foreground uppercase tracking-wider";

export const fieldRowClass =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40 cursor-pointer";

export const hintClass = "text-muted-foreground text-xs";

// ── Wizard stepper ────────────────────────────────────────────────────
// Doubles as the back navigation: a completed step is a button, so there is
// no separate "Back" in the footer competing with it. A step you have not
// earned yet (no title) stays inert rather than disappearing, so the shape of
// the flow is visible from the first keystroke.
export interface WizardStep {
  label: string;
  reachable: boolean;
  step: number;
}

interface WizardStepperProps {
  current: number;
  onSelect: (step: number) => void;
  steps: WizardStep[];
}

export function WizardStepper({
  steps,
  current,
  onSelect,
}: WizardStepperProps) {
  return (
    <nav aria-label="Steps" className="flex items-center gap-1.5">
      {steps.map((entry, index) => {
        const active = entry.step === current;
        const selectable = entry.reachable && !active;
        return (
          <div className="flex items-center gap-1.5" key={entry.step}>
            {index > 0 && <span className="h-px w-4 bg-border" />}
            <button
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs transition-colors ${
                active
                  ? "bg-accent font-medium text-foreground"
                  : selectable
                    ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    : "text-muted-foreground/50"
              }`}
              disabled={!(active || selectable)}
              onClick={() => onSelect(entry.step)}
              type="button"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] tabular-nums ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {entry.step}
              </span>
              {entry.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

// ── Segmented choice ──────────────────────────────────────────────────
// Used for the decisions where the options are peers and the choice changes
// what happens next (agent vs team, start now vs plan). A segmented control
// rather than a dropdown so all options — including the ones not built yet,
// rendered disabled — stay visible.
//
// Selected is a tint of the brand colour, not a fill. `--secondary` is
// `--paper-2` here, near enough to the track that it would not read as chosen
// at all; a solid fill in either foreground or primary turns several of these
// into heavy blocks competing with the submit button. A tint reads at a glance
// and still recedes behind the one control that commits the form.
//
// Geometry: the track pads by 4px (`p-1`) and the chip rounds one step tighter
// than the track, so the chip nests concentrically. No ring — a ring paints
// OUTSIDE the button box, so inside a padded track it lands on the track's own
// border and reads as a rendering fault.
export interface SegmentOption {
  disabled?: boolean;
  icon?: typeof Minus;
  /** Keeps a semantic icon colour (priority) through the selected state. */
  iconClassName?: string;
  label: string;
  value: string;
}

interface SegmentedChoiceProps {
  onChange: (value: string) => void;
  options: SegmentOption[];
  value: string;
}

export function SegmentedChoice({
  options,
  value,
  onChange,
}: SegmentedChoiceProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-sm leading-6 transition-colors ${
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:text-foreground"
            } ${option.disabled ? "cursor-not-allowed opacity-40 hover:text-muted-foreground" : ""}`}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {Icon ? (
              <Icon className={`h-3.5 w-3.5 ${option.iconClassName ?? ""}`} />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Person / agent option list ────────────────────────────────────────
interface OptionSelectorProps {
  emptyLabel: string;
  kind: "user" | "agent";
  onSelect: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  searchPlaceholder: string;
  selected: string | null;
}

export function AssigneeOptionSelectorContent({
  options,
  selected,
  onSelect,
  kind,
  searchPlaceholder,
  emptyLabel,
}: OptionSelectorProps) {
  return (
    <Command className="bg-transparent">
      {options.length >= 7 && <CommandInput placeholder={searchPlaceholder} />}
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
              key={option.value}
              onSelect={() => onSelect(option.value)}
              value={option.label.toLowerCase()}
            >
              <div className="flex items-center gap-2">
                {kind === "agent" ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                ) : (
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                      {getInitials(option.label)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="truncate">{option.label}</span>
              </div>
              {selected === option.value && (
                <Check className="h-4 w-4 shrink-0 text-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

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

// ── Phase Selector ────────────────────────────────────────────────────
// A phase is a project's own subdivision — "in <phase>" is what belongs-where
// means inside a project, and a task cannot sensibly sit in a phase of a
// project it is not in.
interface PhaseSelectorProps {
  noPhaseLabel: string;
  onSelect: (id: string | null) => void;
  phaseId: string | null;
  phases: Array<{ id: string; title: string }>;
  searchPlaceholder: string;
}

export function PhaseSelectorContent({
  phaseId,
  phases,
  onSelect,
  noPhaseLabel,
  searchPlaceholder,
}: PhaseSelectorProps) {
  return (
    <Command className="bg-transparent">
      {phases.length >= 7 && <CommandInput placeholder={searchPlaceholder} />}
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>{noPhaseLabel}</CommandEmpty>
        <CommandGroup>
          <CommandItem
            className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
            onSelect={() => onSelect(null)}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="text-muted-foreground">{noPhaseLabel}</span>
            </div>
            {!phaseId && <Check className="h-4 w-4 shrink-0 text-foreground" />}
          </CommandItem>
          {phases.map((p) => (
            <CommandItem
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
              key={p.id}
              onSelect={() => onSelect(p.id)}
              value={p.title.toLowerCase()}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="truncate">{p.title}</span>
              </div>
              {phaseId === p.id && (
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
