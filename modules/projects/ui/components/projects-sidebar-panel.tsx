import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  buildAssigneeProfileMap,
  useTeamMembersCatalogQuery,
} from "@engenty/tasks/ui/assignee";
import {
  cn,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { deleteProject } from "../api.js";
import { buildProjectsListGroups } from "../lib/project-list-grouping.js";
import { useProjectsSidebarPrefs } from "../lib/use-projects-sidebar-prefs.js";
import { getContactsPluginApi } from "../plugins.js";
import { useProjectsList } from "../queries.js";
import { ProjectCreateModal } from "./project-create-modal.js";
import { ProjectsDeleteConfirmDialog } from "./projects-delete-confirm-dialog.js";
import { ProjectsSidebarFooter } from "./projects-sidebar-footer.js";
// Sub-components
import { ProjectsSidebarHeader } from "./projects-sidebar-header.js";
import {
  ProjectSidebarRow,
  ProjectsSidebarEntitySkeleton,
  ProjectsSidebarGroupedList,
} from "./projects-sidebar-list.js";

const SIDEBAR_FETCH_SIZE = 200;

export function ProjectsSidebarPanel() {
  const { t, i18n } = useTranslation("projects");
  // Canonical, not raw: in a space this is `/s/<key>/<segment>/…`, and every
  // matcher below is written against `/mdl/<module>/…`.
  const pathname = canonicalModulePathname(useLocation().pathname);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;
  const { prefs, updatePrefs } = useProjectsSidebarPrefs();
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void i18n.loadNamespaces(["projects"]);
  }, [i18n]);

  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const contactsQuery = useQuery({
    queryKey: ["projects", "filter-contacts"],
    queryFn: ({ signal }) =>
      contactsPlugin?.getContacts({ pageSize: 100 }, signal) ??
      Promise.resolve([]),
    enabled: !!contactsPlugin,
  });

  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const teamMembersCatalog = teamMembersCatalogQuery.data ?? [];
  const memberProfileMap = useMemo(
    () => buildAssigneeProfileMap(teamMembersCatalog),
    [teamMembersCatalog]
  );

  const allProjectsQuery = useProjectsList({
    page: 1,
    pageSize: 200,
  });
  const allProjects = allProjectsQuery.data?.data ?? [];
  const activeLeadIds = useMemo(
    () =>
      new Set(allProjects.map((p) => p.lead_id).filter(Boolean) as string[]),
    [allProjects]
  );

  const clients = contactsQuery.data ?? [];
  const leadOptions = useMemo(() => {
    const activeLeads = teamMembersCatalog.filter(
      (m) => m.user_id && activeLeadIds.has(m.user_id)
    );
    return activeLeads.map((m) => ({
      id: m.user_id!,
      label: m.full_name,
    }));
  }, [teamMembersCatalog, activeLeadIds]);

  const projectsQuery = useProjectsList({
    page: 1,
    pageSize: SIDEBAR_FETCH_SIZE,
    search: trimmed || undefined,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
    client_id: prefs.clientId === "all" ? undefined : prefs.clientId,
    lead_id: prefs.leadId === "all" ? undefined : prefs.leadId,
  });

  const projects = projectsQuery.data?.data ?? [];
  const isLoading = projectsQuery.isLoading && !projectsQuery.data;

  const groupedProjects = useMemo(
    () =>
      buildProjectsListGroups(
        projects,
        prefs.groupBy,
        t("filters.ungrouped"),
        memberProfileMap,
        t
      ),
    [projects, prefs.groupBy, memberProfileMap, t]
  );

  const match = pathname.match(/^\/(?:module|mdl)\/projects\/([a-f0-9-]+)/i);
  const activeProjectId = match ? match[1] : null;

  const handleCreateSuccess = useCallback(() => {
    setCreateOpen(false);
    void projectsQuery.refetch();
  }, [projectsQuery]);

  const handleDeleteProject = useCallback(
    async (id: string, options?: { deleteTasks?: boolean }) => {
      try {
        await deleteProject(id, options);
        void projectsQuery.refetch();
        if (activeProjectId === id) {
          navigate("/mdl/projects");
        }
      } catch {
        // Ignored, query error handled by API/UI
      } finally {
        setDeletingId(null);
      }
    },
    [activeProjectId, projectsQuery, navigate]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectsSidebarHeader
        clients={clients}
        isSearching={isSearching}
        leads={leadOptions}
        onClearSearch={() => setSearch("")}
        onCreateProject={() => setCreateOpen(true)}
        onSearchChange={setSearch}
        pathname={pathname}
        prefs={prefs}
        search={search}
        trimmed={trimmed}
        updatePrefs={updatePrefs}
      />

      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <SidebarGroup className="min-h-0 flex-1 p-0">
            <SidebarGroupContent>
              {isLoading ? (
                <ProjectsSidebarEntitySkeleton />
              ) : projects.length === 0 ? (
                <p
                  className={cn(
                    "py-2 text-muted-foreground text-xs",
                    sidebarColumnContentInsetClassName
                  )}
                >
                  {isSearching
                    ? t("sidebar.noSearchResults", {
                        defaultValue: "No projects match your search",
                      })
                    : t("sidebar.noProjects", {
                        defaultValue: "No projects yet",
                      })}
                </p>
              ) : (
                <ProjectsSidebarGroupedList
                  emptyLabel={t("sidebar.noProjects", {
                    defaultValue: "No projects yet",
                  })}
                  groups={groupedProjects}
                  renderItem={(project) => (
                    <ProjectSidebarRow
                      active={activeProjectId === project.id}
                      key={project.id}
                      onDelete={setDeletingId}
                      project={project}
                    />
                  )}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <ProjectsSidebarFooter pathname={pathname} />

      <ProjectCreateModal
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        open={createOpen}
      />

      <ProjectsDeleteConfirmDialog
        onClose={() => setDeletingId(null)}
        onConfirm={({ deleteTasks }) =>
          deletingId
            ? handleDeleteProject(deletingId, { deleteTasks })
            : Promise.resolve()
        }
        open={deletingId !== null}
        projectId={deletingId}
      />
    </div>
  );
}
