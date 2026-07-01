import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, FolderKanban } from "lucide-react";
import { useState } from "react";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

// Lightweight project shape — avoids importing from the projects module.
interface ProjectListItem {
  id: string;
  title: string;
}

function useProjectsCatalogQuery() {
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

interface TaskProjectPropertyRowProps {
  disabled?: boolean;
  onChange: (projectId: string | null) => void;
  projectId: string | null;
}

export function TaskProjectPropertyRow({
  projectId,
  onChange,
  disabled,
}: TaskProjectPropertyRowProps) {
  const { t } = useTranslation("tasks");
  const [open, setOpen] = useState(false);
  const projectsQuery = useProjectsCatalogQuery();
  const projects = projectsQuery.data ?? [];

  const selectedProject = projectId
    ? projects.find((project) => project.id === projectId)
    : undefined;

  const handleSelect = (nextProjectId: string | null) => {
    if (nextProjectId !== projectId) {
      onChange(nextProjectId);
    }
    setOpen(false);
  };

  const projectSummary =
    projectId && projectsQuery.isLoading ? (
      <span className="text-muted-foreground text-sm">…</span>
    ) : selectedProject ? (
      <span className="truncate text-sm">{selectedProject.title}</span>
    ) : projectId ? (
      <span className="font-mono text-xs">{projectId}</span>
    ) : (
      <TaskPropertyEmpty>{t("detail.noProject")}</TaskPropertyEmpty>
    );

  if (disabled) {
    return (
      <TaskPropertyRow icon={FolderKanban} label={t("detail.project")}>
        {projectSummary}
      </TaskPropertyRow>
    );
  }

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild disabled={disabled}>
        <TaskPropertyRow
          disabled={disabled}
          icon={FolderKanban}
          interactive
          label={t("detail.project")}
          showChevron
        >
          {projectSummary}
        </TaskPropertyRow>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder={t("detail.searchProjects")} />
          <CommandList className="max-h-56">
            <CommandEmpty>{t("detail.noProjectMatch")}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleSelect(null)} value="__none__">
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    projectId === null ? "opacity-100" : "opacity-0"
                  )}
                />
                {t("detail.clearProject")}
              </CommandItem>
              {projectsQuery.isLoading ? (
                <CommandItem disabled value="__loading__">
                  …
                </CommandItem>
              ) : (
                projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    keywords={[project.title]}
                    onSelect={() => handleSelect(project.id)}
                    value={project.title}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        projectId === project.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {project.title}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
