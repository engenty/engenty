import { resolveAgentEngenty } from "@engenty/ai-core/browser";
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
  Engenty,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import {
  FolderInput,
  FolderKanban,
  LayoutGrid,
  SquareCheckBig,
} from "lucide-react";
import { useState } from "react";
import type { AiRegisteredAgent } from "../lib/admin/ai-runtime-types.js";
import { getAiAgents } from "../lib/runtime/registry-api.js";

/** Promotion target for the active artifact ("move away" from the chat). */
export interface ArtifactStoreTarget {
  scopeId: string;
  scopeType: "task" | "project" | "space" | "agent";
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

/** Hired + module Engenties only — copilot/coordinator/delegated stay out. */
function isStoreableEngenty(agent: Pick<AiRegisteredAgent, "role">): boolean {
  return (agent.role ?? "specialist") === "specialist";
}

function useSpaceStoreEngentiesQuery(
  spaceId: string | undefined,
  enabled: boolean
) {
  return useQuery({
    enabled: Boolean(enabled && spaceId),
    queryFn: async ({ signal }) => {
      if (!spaceId) {
        return [];
      }
      const [surface, catalog] = await Promise.all([
        requestApiEnvelope<{ agents?: string[] }>(
          `/api/spaces/${encodeURIComponent(spaceId)}/surface`,
          { method: "GET", signal }
        ),
        getAiAgents(signal),
      ]);
      const mounted = new Set(surface.data.agents ?? []);
      return catalog.agents
        .filter((agent) => mounted.has(agent.id) && isStoreableEngenty(agent))
        .toSorted((a, b) => a.name.localeCompare(b.name));
    },
    queryKey: ["artifacts", "store-engenties", spaceId],
    staleTime: 60_000,
  });
}

export interface ArtifactMoveMenuProps {
  disabled?: boolean;
  onStore: (target: ArtifactStoreTarget) => void;
  /**
   * The space the user is in, offered as a one-click target — moving there
   * puts the artifact into the space's Data tree.
   */
  spaceTarget?: { id: string; name?: string } | null;
  /** Task offered as a one-click target when the surrounding route is a task. */
  taskTarget?: { id: string; title?: string } | null;
}

/**
 * Move menu in the artifact pane's top bar: changes the active artifact's
 * scope to a task, project, space, or Engenty so it outlives the chat.
 * Projects and Engenties load lazily on first open.
 */
export function ArtifactMoveMenu({
  disabled,
  onStore,
  spaceTarget,
  taskTarget,
}: ArtifactMoveMenuProps) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  const projectsQuery = useProjectsCatalogQuery(open);
  const projects = projectsQuery.data ?? [];
  const engentiesQuery = useSpaceStoreEngentiesQuery(spaceTarget?.id, open);
  const engenties = engentiesQuery.data ?? [];

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
          <FolderInput className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder={t("artifacts.storeSearch")} />
          <CommandList className="max-h-56">
            <CommandEmpty>{t("artifacts.storeNoMatch")}</CommandEmpty>
            {spaceTarget ? (
              <CommandGroup heading={t("artifacts.storeToSpace")}>
                <CommandItem
                  keywords={[spaceTarget.name ?? ""]}
                  onSelect={() =>
                    select({ scopeType: "space", scopeId: spaceTarget.id })
                  }
                  value={`space ${spaceTarget.name ?? ""} ${spaceTarget.id}`}
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  <span className="min-w-0 truncate">
                    {spaceTarget.name?.trim() || spaceTarget.id}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {spaceTarget ? (
              <CommandGroup heading={t("artifacts.storeToEngenty")}>
                {engentiesQuery.isLoading ? (
                  <CommandItem disabled value="__engenty-loading__">
                    …
                  </CommandItem>
                ) : engenties.length === 0 ? (
                  <CommandItem disabled value="__engenty-none__">
                    {t("artifacts.storeNoEngenties")}
                  </CommandItem>
                ) : (
                  engenties.map((agent) => (
                    <CommandItem
                      key={agent.id}
                      keywords={[agent.name, agent.id]}
                      onSelect={() =>
                        select({ scopeType: "agent", scopeId: agent.id })
                      }
                      value={`agent ${agent.name} ${agent.id}`}
                    >
                      <Engenty
                        animated={false}
                        className="mr-2 shrink-0 [&_.e-shadow]:hidden"
                        kind={resolveAgentEngenty(agent.id, agent.engenty)}
                        size={16}
                      />
                      <span className="min-w-0 truncate">{agent.name}</span>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            ) : null}
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
