import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  Skeleton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectListItem } from "../api.js";
import type { ProjectsListGroup } from "../lib/project-list-grouping.js";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function ProjectsSidebarEntitySkeleton() {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        sidebarColumnContentInsetClassName
      )}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton className="h-6 w-full" key={`proj-${i}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single project row
// ---------------------------------------------------------------------------

interface ProjectSidebarRowProps {
  active: boolean;
  onDelete: (id: string) => void;
  project: ProjectListItem;
}

export function ProjectSidebarRow({
  active,
  project,
  onDelete,
}: ProjectSidebarRowProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();

  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={`/mdl/projects/${project.id}`}
          {...shellSecondaryNavItemProps}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{project.title}</span>
          </span>
        </Link>
      </SidebarRowButton>
      <SidebarRowActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("sidebar.project_menu_aria", {
                defaultValue: "Project actions",
              })}
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              title={t("sidebar.project_menu_aria", {
                defaultValue: "Project actions",
              })}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <MoreVertical aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40 rounded-lg p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              className="h-8 justify-start text-xs"
              onSelect={() => navigate(`/mdl/projects/${project.id}`)}
              {...shellSecondaryNavItemProps}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              {t("viewProject", { defaultValue: "View project" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-8 justify-start text-destructive text-xs focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onSelect={() => onDelete(project.id)}
              {...shellSecondaryNavItemProps}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarRowActions>
    </SidebarRow>
  );
}

// ---------------------------------------------------------------------------
// Grouped list
// ---------------------------------------------------------------------------

interface ProjectsSidebarGroupedListProps {
  emptyLabel: string;
  groups: ProjectsListGroup[];
  renderItem: (item: ProjectListItem) => ReactNode;
}

export function ProjectsSidebarGroupedList({
  emptyLabel,
  groups,
  renderItem,
}: ProjectsSidebarGroupedListProps) {
  const totalCount = groups.reduce((sum, g) => sum + g.projects.length, 0);

  if (totalCount === 0) {
    return (
      <p
        className={cn(
          sidebarColumnContentInsetClassName,
          "text-muted-foreground text-xs"
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <SidebarNavList>
      {groups.map((group) => (
        <div className="contents" key={group.key}>
          {group.label ? (
            <SidebarNavSectionLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-muted-foreground text-xxs">
                  ({group.projects.length})
                </span>
              </span>
            </SidebarNavSectionLabel>
          ) : null}
          {group.projects.map((item) => renderItem(item))}
        </div>
      ))}
    </SidebarNavList>
  );
}
