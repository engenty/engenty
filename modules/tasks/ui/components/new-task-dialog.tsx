// Task creation as a two-step wizard: WHAT (title, description, where it
// belongs) then WHO & WHEN (assignee, start-or-plan, priority, due date).
//
// The earlier single screen wrote its metadata as a sentence of muted pills
// ("[Projekt] Für [Zuständig] in [Ziel]"), which only parses if you already
// know the model. Splitting the steps lets the second one carry the decision
// that actually changes behaviour — assigning to an agent IS the dispatch (the
// gateway runs `dispatchTaskIfReady` on create) — with the consequence spelled
// out instead of discovered by watching the task start itself.
//
// Status is not a field here. A creator cares about "start now" vs "just plan
// it"; the full status enum belongs on the board, not in the create path.
//
// "Who" has two answers: an agent or a person. An Action is never the worker of
// a task — running one is a routine on a specialist or a press, and neither
// creates a work item.
import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import {
  Bot,
  ChevronDown,
  FolderKanban,
  Layers,
  Loader2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PrimaryAssigneeKind,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { useAgentCatalogQuery } from "../hooks/use-agent-catalog-query.js";
import { buildTaskAssigneeMemberOptions } from "../lib/team-catalog-ui.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import {
  AssigneeOptionSelectorContent,
  fieldRowClass,
  PhaseSelectorContent,
  PRIORITY_META,
  PrioritySelectorContent,
  ProjectSelectorContent,
  pillClass,
  SegmentedChoice,
  type SegmentOption,
  sectionLabelClass,
  WizardStepper,
} from "./new-task-selectors.js";
import { NewTaskWhenFields } from "./new-task-when-fields.js";
import type { TaskAssigneeValue } from "./task-assignee-picker.js";
import type { TaskFormSubmitData } from "./task-form-dialog.js";

// Lightweight project type — avoids importing from the projects module
interface ProjectListItem {
  id: string;
  title: string;
}

function useProjectsQuery() {
  return useQuery({
    queryKey: ["projects", "list-minimal"],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<ProjectListItem[]>(
        "/api/projects?pageSize=100&sortBy=title&sortOrder=asc",
        { method: "GET", signal }
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}

interface ProjectPhaseItem {
  id: string;
  order_index: number;
  title: string;
}

/** Platform agents that are not workers of a task. */
const NON_WORKER_AGENT_TYPE_KEYS = new Set([
  "engenty.cli",
  "engenty.copilot",
  "engenty.file-analyst",
]);

/**
 * Phases of the picked project.
 *
 * There is no `GET /phases` route (only create/update/delete); phases are
 * served as part of the project detail, so that is what this reads.
 */
function useProjectPhasesQuery(projectId: string | null) {
  return useQuery({
    enabled: Boolean(projectId),
    queryKey: ["projects", "phases", projectId],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<{ phases?: ProjectPhaseItem[] }>(
        `/api/projects/${projectId}`,
        { method: "GET", signal }
      );
      return [...(res.data?.phases ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      );
    },
    staleTime: 60_000,
  });
}

interface NewTaskDialogProps {
  defaultAgentTypeKey?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormSubmitData) => Promise<void>;
  open: boolean;
  taskStatusDefinitions?: TaskStatusDefinition[];
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
}

const EMPTY_ASSIGNEE: TaskAssigneeValue = {
  collaborator_user_ids: [],
  primary_assignee_agent_type_key: null,
  primary_assignee_kind: "none",
  primary_assignee_user_id: null,
};

/** Who the work goes to — a specialist or a person. */
type WorkerChoice = "agent" | "user";

/** "Start now" and "just plan it" map onto the two entry statuses. */
const START_STATUS = "todo";
const PLAN_STATUS = "backlog";

/** Title grows to a ceiling, then scrolls — the description just flexes. */
const TITLE_MAX_HEIGHT = 96;

export function NewTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultAgentTypeKey = null,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
}: NewTaskDialogProps) {
  const { t } = useTranslation("tasks");

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(EMPTY_ASSIGNEE);
  const [worker, setWorker] = useState<WorkerChoice>("agent");
  const [startNow, setStartNow] = useState(true);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [projectOpen, setProjectOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [descriptionHasMore, setDescriptionHasMore] = useState(false);

  /**
   * A scrollport that clips mid-line reads as a rendering bug, not as "there
   * is more" — so the fade is driven by whether anything is actually below the
   * fold, and disappears once you reach the end.
   */
  const syncDescriptionFade = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) {
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setDescriptionHasMore(remaining > 2);
  }, []);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setProjectId(null);
      setPhaseId(null);
      setAssignee(
        defaultAgentTypeKey
          ? {
              ...EMPTY_ASSIGNEE,
              primary_assignee_agent_type_key: defaultAgentTypeKey,
              primary_assignee_kind: "agent",
            }
          : EMPTY_ASSIGNEE
      );
      setWorker("agent");
      setStartNow(true);
      setDueDate(null);
      setSubmitting(false);
      setDescriptionHasMore(false);
    }
  }, [defaultAgentTypeKey, open]);

  // Data
  const agentCatalog = useAgentCatalogQuery();
  const agentOptions = useMemo(
    () =>
      agentCatalog.agents.map((a) => ({
        value: a.agent_type_key,
        label: a.label,
      })),
    [agentCatalog.agents]
  );

  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const phasesQuery = useProjectPhasesQuery(projectId);
  const phases = phasesQuery.data ?? [];
  const selectedPhase = useMemo(
    () => phases.find((p) => p.id === phaseId) ?? null,
    [phases, phaseId]
  );

  const memberOptions = useMemo(
    () =>
      teamMembersEnabled
        ? buildTaskAssigneeMemberOptions(teamMembersCatalog)
        : [],
    [teamMembersCatalog, teamMembersEnabled]
  );

  const kind = assignee.primary_assignee_kind;

  // Entering step 2 picks a default so the common path is one click: the
  // first specialist in the catalog. Never Copilot — it is the human's
  // assistant, not a task worker.
  const defaultAgentKey = useMemo(() => {
    if (defaultAgentTypeKey) {
      return defaultAgentTypeKey;
    }
    return (
      agentOptions.find((a) => !NON_WORKER_AGENT_TYPE_KEYS.has(a.value))
        ?.value ?? null
    );
  }, [agentOptions, defaultAgentTypeKey]);

  const setKind = useCallback(
    (next: PrimaryAssigneeKind) => {
      setAssignee((prev) => ({
        ...prev,
        primary_assignee_agent_type_key:
          next === "agent"
            ? (prev.primary_assignee_agent_type_key ?? defaultAgentKey)
            : null,
        primary_assignee_kind: next,
        primary_assignee_user_id:
          next === "user" ? prev.primary_assignee_user_id : null,
      }));
    },
    [defaultAgentKey]
  );

  // Who does the work: an agent or a person. Both are assignees, so the choice
  // is nothing more than the assignee's kind.
  const chooseWorker = useCallback(
    (next: WorkerChoice) => {
      setWorker(next);
      setKind(next);
    },
    [setKind]
  );

  const goToStep2 = useCallback(() => {
    if (kind === "none") {
      setKind("agent");
    }
    setStep(2);
  }, [kind, setKind]);

  const assigneeLabel = useMemo(() => {
    if (kind === "user") {
      const m = teamMembersCatalog.find(
        (r) =>
          r.user_id === assignee.primary_assignee_user_id ||
          r.id === assignee.primary_assignee_user_id
      );
      return m?.full_name ?? null;
    }
    if (kind === "agent") {
      return (
        agentOptions.find(
          (a) => a.value === assignee.primary_assignee_agent_type_key
        )?.label ?? assignee.primary_assignee_agent_type_key
      );
    }
    return null;
  }, [kind, assignee, teamMembersCatalog, agentOptions]);

  /**
   * Grow to fit, but never past `max` — an uncapped scrollHeight assignment
   * lets a long paste push the dialog (and its footer) off screen.
   */
  const autoGrow = useCallback((el: HTMLTextAreaElement, max: number) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        status: startNow ? START_STATUS : PLAN_STATUS,
        priority,
        due_date: dueDate,
        phase_id: projectId ? phaseId : null,
        project_id: projectId,
        primary_assignee_kind: assignee.primary_assignee_kind,
        primary_assignee_user_id: assignee.primary_assignee_user_id,
        primary_assignee_agent_type_key:
          assignee.primary_assignee_agent_type_key,
        collaborator_user_ids: assignee.collaborator_user_ids,
      });
      onOpenChange(false);
    } catch {
      setSubmitting(false);
    }
  }, [
    title,
    description,
    startNow,
    priority,
    dueDate,
    phaseId,
    projectId,
    assignee,
    submitting,
    onSubmit,
    onOpenChange,
  ]);

  // Who: agents and humans are peers here. "Nobody" is not a tab — leaving it
  // unassigned is what the Skip action does.
  const whoOptions = useMemo<SegmentOption[]>(() => {
    const options: SegmentOption[] = [
      { icon: Bot, label: t("newTask.whoAgent"), value: "agent" },
    ];
    if (memberOptions.length > 0) {
      options.push({ icon: Users, label: t("newTask.whoTeam"), value: "user" });
    }
    return options;
  }, [memberOptions.length, t]);

  const PriorityIcon = PRIORITY_META[priority].icon;

  const canContinue = Boolean(title.trim());
  const canSubmit =
    canContinue &&
    !submitting &&
    (kind === "none" ||
      (kind === "agent"
        ? Boolean(assignee.primary_assignee_agent_type_key)
        : Boolean(assignee.primary_assignee_user_id)));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b px-6 py-3.5">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-base">
              {t("newTask.title")}
            </span>
            <WizardStepper
              current={step}
              onSelect={(next) => {
                if (next === 2) {
                  goToStep2();
                  return;
                }
                setStep(1);
              }}
              steps={[
                { label: t("newTask.stepWhat"), reachable: true, step: 1 },
                {
                  label: t("newTask.stepWhoWhen"),
                  reachable: canContinue,
                  step: 2,
                },
              ]}
            />
          </div>
          <button
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden px-6 py-5">
          {step === 1 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <textarea
                autoFocus
                className="max-h-24 w-full resize-none overflow-hidden bg-transparent font-semibold text-xl outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => {
                  setTitle(e.target.value);
                  autoGrow(e.target, TITLE_MAX_HEIGHT);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canContinue) {
                      goToStep2();
                    }
                  }
                }}
                placeholder={t("newTask.titlePlaceholder")}
                ref={titleRef}
                rows={1}
                value={title}
              />

              <textarea
                className={`ui-thin-scrollbar min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent pt-1 text-sm outline-none placeholder:text-muted-foreground/60 ${
                  descriptionHasMore ? "ui-scroll-fade-b" : ""
                }`}
                onChange={(e) => {
                  setDescription(e.target.value);
                  syncDescriptionFade();
                }}
                onScroll={syncDescriptionFade}
                placeholder={t("newTask.descriptionPlaceholder")}
                ref={descriptionRef}
                value={description}
              />
              {/* Where it belongs, at the foot of the step: [Project] in
                  [Phase] — a task inside a project belongs to one of its
                  phases. */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-muted-foreground text-xs">
                <Popover modal onOpenChange={setProjectOpen} open={projectOpen}>
                  <PopoverTrigger asChild>
                    <button className={pillClass} type="button">
                      {selectedProject ? (
                        <>
                          <FolderKanban className="h-3 w-3 text-muted-foreground" />
                          <span className="max-w-[160px] truncate text-foreground">
                            {selectedProject.title}
                          </span>
                        </>
                      ) : (
                        <>
                          <FolderKanban className="h-3 w-3" />
                          <span>{t("newTask.projectPlaceholder")}</span>
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <ProjectSelectorContent
                      onSelect={(id) => {
                        setProjectId(id);
                        setPhaseId(null);
                        setProjectOpen(false);
                      }}
                      projectId={projectId}
                      projects={projects}
                    />
                  </PopoverContent>
                </Popover>

                {projectId ? (
                  <>
                    <span>{t("newTask.inLabel")}</span>
                    <Popover modal onOpenChange={setPhaseOpen} open={phaseOpen}>
                      <PopoverTrigger asChild>
                        <button className={pillClass} type="button">
                          <Layers className="h-3 w-3" />
                          <span
                            className={
                              selectedPhase
                                ? "max-w-[160px] truncate text-foreground"
                                : ""
                            }
                          >
                            {selectedPhase?.title ??
                              t("newTask.phasePlaceholder")}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-0">
                        <PhaseSelectorContent
                          noPhaseLabel={t("newTask.noPhase")}
                          onSelect={(id) => {
                            setPhaseId(id);
                            setPhaseOpen(false);
                          }}
                          phaseId={phaseId}
                          phases={phases}
                          searchPlaceholder={t("newTask.searchPhases")}
                        />
                      </PopoverContent>
                    </Popover>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto">
              {/* Who */}
              <div className="space-y-2.5">
                <p className={sectionLabelClass}>{t("newTask.whoLabel")}</p>
                <SegmentedChoice
                  onChange={(next) => chooseWorker(next as WorkerChoice)}
                  options={whoOptions}
                  value={worker}
                />
                <Popover
                  modal
                  onOpenChange={setAssigneeOpen}
                  open={assigneeOpen}
                >
                  <PopoverTrigger asChild>
                    <button className={fieldRowClass} type="button">
                      <span className="flex min-w-0 items-center gap-2">
                        {kind === "user" ? (
                          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={`truncate ${assigneeLabel ? "" : "text-muted-foreground"}`}
                        >
                          {assigneeLabel ??
                            t(
                              kind === "user"
                                ? "newTask.pickPerson"
                                : "newTask.pickAgent"
                            )}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-0">
                    <AssigneeOptionSelectorContent
                      emptyLabel={t("newTask.noAssigneeMatch")}
                      kind={kind === "user" ? "user" : "agent"}
                      onSelect={(value) => {
                        setAssignee((prev) => ({
                          ...prev,
                          primary_assignee_agent_type_key:
                            kind === "user" ? null : value,
                          primary_assignee_user_id:
                            kind === "user" ? value : null,
                        }));
                        setAssigneeOpen(false);
                      }}
                      options={kind === "user" ? memberOptions : agentOptions}
                      searchPlaceholder={t("newTask.searchAssignees")}
                      selected={
                        kind === "user"
                          ? assignee.primary_assignee_user_id
                          : assignee.primary_assignee_agent_type_key
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <NewTaskWhenFields
                dueDate={dueDate}
                onDueDateChange={setDueDate}
                onStartNowChange={setStartNow}
                startNow={startNow}
                workerHint={
                  startNow ? (kind === "user" ? "user" : "agent") : "plan"
                }
              />

              {/* Priority — same pill affordance as project on step 1 */}
              <div className="space-y-2.5">
                <p className={sectionLabelClass}>
                  {t("newTask.priorityLabel")}
                </p>
                <div>
                  <Popover
                    modal
                    onOpenChange={setPriorityOpen}
                    open={priorityOpen}
                  >
                    <PopoverTrigger asChild>
                      <button className={pillClass} type="button">
                        <PriorityIcon
                          className={`h-3 w-3 ${PRIORITY_META[priority].className}`}
                        />
                        <span className="text-foreground">
                          {t(`priority.${priority}`)}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-44 p-1">
                      <PrioritySelectorContent
                        onSelect={(p) => {
                          setPriority(p);
                          setPriorityOpen(false);
                        }}
                        priority={priority}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — no Back button: the stepper above IS the back navigation */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("newTask.cancel")}
          </Button>
          {step === 1 ? (
            <Button disabled={!canContinue} onClick={goToStep2} type="button">
              {t("newTask.next")}
            </Button>
          ) : (
            <Button disabled={!canSubmit} onClick={handleSubmit} type="button">
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("newTask.creating")}
                </>
              ) : (
                t("newTask.createButton")
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
