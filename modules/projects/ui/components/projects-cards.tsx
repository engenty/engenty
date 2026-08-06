import { useTranslation } from "@engenty/i18n/ui";
import type { AvatarStackProfile } from "@engenty/ui-core";
import {
  AvatarStack,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MoreVertical, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api.js";
import { getProjectDisplayProfiles } from "../lib/project-display-members.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { useProjectTaskCounts } from "../queries.js";

type TableSize = "compact" | "normal";

function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "-";
}

function stripHtml(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ProjectCardProps {
  isSelected: boolean;
  memberProfileMap: Map<string, AvatarStackProfile>;
  onCardClick: (project: ProjectListItem) => void;
  onDelete?: (projectId: string) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  project: ProjectListItem;
  showTeamMembers: boolean;
  tableSize: TableSize;
  teamMemberCatalog: TeamMemberCatalogRow[];
}

function ProjectCard({
  project,
  tableSize,
  onCardClick,
  onSelectOne,
  onDelete,
  isSelected,
  showTeamMembers,
  teamMemberCatalog,
  memberProfileMap,
}: ProjectCardProps) {
  const { t } = useTranslation("projects");
  const countsQuery = useProjectTaskCounts({ project_id: project.id });
  const counts = countsQuery.data ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const done = counts.done ?? 0;
  const cancelled = counts.cancelled ?? 0;
  const open = Math.max(0, total - done - cancelled);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const clientLabel = project.client_name ?? project.client_id ?? "—";
  const clientUrl = project.client_id?.trim()
    ? `/mdl/contacts/${project.client_id}`
    : null;
  const briefingText = stripHtml(project.briefing);
  const teamProfiles = showTeamMembers
    ? getProjectDisplayProfiles(project, teamMemberCatalog, memberProfileMap)
    : [];

  return (
    <div
      className={cn(
        "ui-card-raised group relative block cursor-pointer rounded-md bg-card text-left transition-shadow",
        isSelected ? "ui-card-selected" : "hover:shadow-[var(--e-3)]",
        tableSize === "compact" ? "p-3" : "p-5"
      )}
      onClick={() => onCardClick(project)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCardClick(project);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Selection checkbox — top-left */}
      <div
        className={cn(
          "absolute top-2 left-2 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) =>
            onSelectOne(project.id, checked === true)
          }
        />
      </div>

      {/* Progress — top-right; menu overlays this corner */}
      {total > 0 && (
        <div className="absolute top-2.5 right-2 flex items-center gap-1.5">
          <span className="text-muted-foreground text-xxs">
            {open} {t("detail.open")}
          </span>
          <div
            className="h-1.5 w-12 overflow-hidden rounded-full bg-muted"
            title={`${progressPct}% ${t("detail.done")}`}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${String(progressPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* 3-dot menu — overlays top-right (same corner as progress) */}
      <div
        className="absolute top-1.5 right-1.5 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md bg-card text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                "opacity-0 group-hover:opacity-100",
                isSelected && "opacity-100"
              )}
              type="button"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(project.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Client topline — only when a real client is set */}
      {(project.client_name || project.client_id) && (
        <p
          className={cn(
            "truncate text-muted-foreground text-xs underline-offset-2 group-hover:underline",
            total > 0 ? "pr-28" : undefined
          )}
        >
          {clientUrl ? (
            <Link
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
              to={clientUrl}
            >
              {clientLabel}
            </Link>
          ) : (
            clientLabel
          )}
        </p>
      )}

      {/* Project title */}
      <p
        className={cn(
          "truncate font-medium text-base",
          (project.client_name || project.client_id) && "mt-1",
          total > 0 && "pr-28"
        )}
      >
        {project.title}
      </p>

      {/* Briefing */}
      {briefingText ? (
        <p className="mt-1.5 line-clamp-3 break-words text-muted-foreground text-sm">
          {briefingText}
        </p>
      ) : null}

      {/* Time frame */}
      <p
        className={cn(
          "text-muted-foreground text-xs",
          tableSize === "compact" ? "mt-1" : "mt-2"
        )}
      >
        {formatDate(project.start_date)} – {formatDate(project.end_date)}
      </p>

      {teamProfiles.length > 0 && (
        <div className="mt-2 flex items-center justify-end">
          <AvatarStack max={4} profiles={teamProfiles} size="sm" />
        </div>
      )}
    </div>
  );
}

export interface ProjectsCardsProps {
  memberProfileMap: Map<string, AvatarStackProfile>;
  onCardClick: (project: ProjectListItem) => void;
  onDelete?: (projectId: string) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  projects: ProjectListItem[];
  selectedIds: Set<string>;
  showTeamMembers?: boolean;
  tableSize: TableSize;
  teamMemberCatalog: TeamMemberCatalogRow[];
}

export function ProjectsCards({
  projects,
  tableSize,
  onCardClick,
  onSelectOne,
  onDelete,
  selectedIds,
  showTeamMembers = true,
  teamMemberCatalog,
  memberProfileMap,
}: ProjectsCardsProps) {
  return (
    <div
      className={`grid gap-4 ${tableSize === "compact" ? "gap-2" : "gap-4"}`}
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(min(400px, 100%), 1fr))",
      }}
    >
      {projects.map((p) => (
        <ProjectCard
          isSelected={selectedIds.has(p.id)}
          key={p.id}
          memberProfileMap={memberProfileMap}
          onCardClick={onCardClick}
          onDelete={onDelete}
          onSelectOne={onSelectOne}
          project={p}
          showTeamMembers={showTeamMembers}
          tableSize={tableSize}
          teamMemberCatalog={teamMemberCatalog}
        />
      ))}
    </div>
  );
}
