import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { FolderKanban, Pin, SquareCheckBig } from "lucide-react";
import { useState } from "react";

/** Promotion target for the active artifact ("store away" from the chat). */
export interface ArtifactStoreTarget {
  scopeId: string;
  scopeType: "task" | "project" | "goal";
}

// Lightweight project shape — same minimal catalog the tasks module reads;
// the projects module may be absent, in which case the query errors and the
// group falls back to its empty item.
interface ProjectListItem {
  id: string;
  title: string;
}

function useProjectsCatalogQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["projects", "list-minimal"],
    enabled,
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

export interface ArtifactPinMenuProps {
  disabled?: boolean;
  onStore: (target: ArtifactStoreTarget) => void;
  /** Task offered as a one-click target when the surrounding route is a task. */
  taskTarget?: { id: string; title?: string } | null;
}

/**
 * Pin ("store") menu in the artifact pane's top bar: moves the active artifact
 * to a task or project scope so it outlives the chat. Projects load lazily on
 * first open.
 */
export function ArtifactPinMenu({
  disabled,
  onStore,
  taskTarget,
}: ArtifactPinMenuProps) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  const projectsQuery = useProjectsCatalogQuery(open);
  const projects = projectsQuery.data ?? [];

  const select = (target: ArtifactStoreTarget) => {
    onStore(target);
    setOpen(false);
  };

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("artifacts.storeAction")}
          disabled={disabled}
          size="icon-sm"
          variant="ghost"
        >
          <Pin className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder={t("artifacts.storeSearch")} />
          <CommandList className="max-h-56">
            <CommandEmpty>{t("artifacts.storeNoMatch")}</CommandEmpty>
            {taskTarget ? (
              <CommandGroup heading={t("artifacts.storeToTask")}>
                <CommandItem
                  keywords={[taskTarget.title ?? ""]}
                  onSelect={() =>
                    select({ scopeType: "task", scopeId: taskTarget.id })
                  }
                  value={`task ${taskTarget.title ?? ""} ${taskTarget.id}`}
                >
                  <SquareCheckBig className="mr-2 h-4 w-4" />
                  <span className="min-w-0 truncate">
                    {taskTarget.title?.trim() || taskTarget.id}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading={t("artifacts.storeToProject")}>
              {projectsQuery.isLoading ? (
                <CommandItem disabled value="__loading__">
                  …
                </CommandItem>
              ) : projects.length === 0 ? (
                <CommandItem disabled value="__none__">
                  {t("artifacts.storeNoProjects")}
                </CommandItem>
              ) : (
                projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    keywords={[project.title]}
                    onSelect={() =>
                      select({ scopeType: "project", scopeId: project.id })
                    }
                    value={`project ${project.title} ${project.id}`}
                  >
                    <FolderKanban className="mr-2 h-4 w-4" />
                    <span className="min-w-0 truncate">{project.title}</span>
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
