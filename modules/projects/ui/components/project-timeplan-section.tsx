import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type { PhaseTask, ProjectPhase } from "../api.js";
import { PhaseTimeline } from "./phase-timeline.js";
import { ProjectDatesRow } from "./project-dates-row.js";

interface ProjectTimeplanSectionProps {
  /** Render the "Zeitplan" heading with a collapse toggle (project main page). */
  collapsible?: boolean;
  dateLocale?: string;
  endDate: string | null;
  onPhaseCreate?: (title: string) => Promise<string | null>;
  onPhaseFormOpen?: () => void;
  onPhaseTitleUpdate?: (phaseId: string, title: string) => void | Promise<void>;
  onPhaseUpdate?: (
    phaseId: string,
    startDate: string | null,
    endDate: string | null
  ) => void | Promise<void>;
  phases: (ProjectPhase & { tasks: PhaseTask[] })[];
  startDate: string | null;
  viewMode: "internal" | "external";
}

/**
 * Project dates + Gantt + "add phase". Shared by the collapsible block on the
 * project main page and the dedicated time-planning tab, which renders it
 * expanded. Only mounted for projects with `timeplan_enabled`.
 */
export function ProjectTimeplanSection({
  collapsible = false,
  dateLocale,
  endDate,
  onPhaseCreate,
  onPhaseFormOpen,
  onPhaseTitleUpdate,
  onPhaseUpdate,
  phases,
  startDate,
  viewMode,
}: ProjectTimeplanSectionProps) {
  const { t } = useTranslation("projects");
  const [collapsed, setCollapsed] = useState(false);
  const internal = viewMode === "internal";

  const body = (
    <div className="min-h-0 space-y-3 overflow-hidden">
      <ProjectDatesRow
        endDate={endDate}
        locale={dateLocale}
        startDate={startDate}
      />
      <PhaseTimeline
        onPhaseCreate={internal ? onPhaseCreate : undefined}
        onPhaseTitleUpdate={internal ? onPhaseTitleUpdate : undefined}
        onPhaseUpdate={internal ? onPhaseUpdate : undefined}
        phases={phases}
        projectDueDate={endDate}
        projectStartDate={startDate}
        readOnly={!internal}
      />
      {internal && onPhaseFormOpen && (
        <div>
          <Button onClick={onPhaseFormOpen} size="sm" variant="outline">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("detail.addPhase")}
          </Button>
        </div>
      )}
    </div>
  );

  if (!collapsible) {
    return <section className="space-y-3">{body}</section>;
  }

  return (
    <section className="space-y-3">
      <button
        aria-expanded={!collapsed}
        className="flex items-center gap-2 font-medium text-lg"
        onClick={() => setCollapsed((v) => !v)}
        type="button"
      >
        <ChevronRight
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-in-out",
            !collapsed && "rotate-90"
          )}
        />
        {t("detail.timePlan")}
        {collapsed && (
          <ProjectDatesRow
            endDate={endDate}
            locale={dateLocale}
            startDate={startDate}
          />
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
          collapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
        )}
      >
        {body}
      </div>
    </section>
  );
}
