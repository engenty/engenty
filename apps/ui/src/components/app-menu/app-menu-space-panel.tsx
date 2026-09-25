import { AgentFace } from "@engenty/ai-ui";
import { fileSpaceOwnerKey, spaceFileSpaceOwner } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { CommandGroup, CommandItem, CommandSeparator } from "@engenty/ui-core";
import {
  FileText,
  LayoutDashboard,
  LayoutGrid,
  NotebookPen,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { useSpaceFilesShortcuts } from "@/lib/api/space-files-shortcuts-client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import {
  spaceAgentDeskPath,
  spaceAgentHirePath,
  spaceDataArtifactPath,
  spaceDataFilePath,
  spaceModulePath,
  spaceRootPath,
} from "@/lib/space-routes";
import { useSpaceModules } from "@/lib/use-space-modules";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

const LATEST_LIMIT = 5;

function latestByUpdatedAt<T extends { updatedAt?: string }>(
  items: readonly T[]
): T[] {
  return [...items]
    .sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
    )
    .slice(0, LATEST_LIMIT);
}

export function AppMenuSpacePanel({
  onNavigate,
  space,
}: {
  onNavigate: (to: string) => void;
  space: { id: string; key: string; name: string };
}) {
  const { t } = useTranslation("common");
  const { agents } = useSpaceRosterAgents(space.id);
  const { modules } = useSpaceModules(space.id);
  const fileOwner = spaceFileSpaceOwner(space.id);
  const files = useSpaceFilesShortcuts(fileOwner);
  const artifactsQuery = useQuery({
    queryFn: ({ signal }) => getSpaceArtifacts(space.id, signal),
    queryKey: spaceDriveKeys.artifacts(space.id),
  });
  const artifacts = useMemo(
    () => latestByUpdatedAt(artifactsQuery.data ?? []),
    [artifactsQuery.data]
  );
  const recentFiles = files.recent.slice(0, LATEST_LIMIT);
  const fileSpaceKey = fileSpaceOwnerKey(fileOwner);
  const dashboardLabel = t("spaces.dashboard", { defaultValue: "Dashboard" });
  const hireLabel = t("spaces.agents.hire", { defaultValue: "Hire an agent" });

  return (
    <>
      <CommandGroup>
        <CommandItem
          onSelect={() => onNavigate(spaceRootPath(space.key))}
          value={`${dashboardLabel} ${space.name}`}
        >
          <LayoutDashboard className="mr-2 size-4 shrink-0" />
          <span>{dashboardLabel}</span>
        </CommandItem>
        <CommandItem
          onSelect={() => onNavigate(spaceAgentHirePath(space.key))}
          value={`${hireLabel} ${space.name}`}
        >
          <UserPlus className="mr-2 size-4 shrink-0" />
          <span>{hireLabel}</span>
        </CommandItem>
      </CommandGroup>
      {agents.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup heading={t("spaces.home.sections.agents")}>
            {agents.map((agent) => (
              <CommandItem
                key={agent.id}
                onSelect={() =>
                  onNavigate(spaceAgentDeskPath(space.key, agent.id))
                }
                value={`${agent.name} ${space.name}`}
              >
                <AgentFace
                  avatarUrl={agent.avatarUrl}
                  className="mr-2 [&_.e-shadow]:hidden"
                  kind={agent.engenty}
                  name={agent.name}
                  size={16}
                />
                <span className="min-w-0 truncate">{agent.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
      {modules.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup
            heading={t("spaces.apps.section", { defaultValue: "Modules" })}
          >
            {modules.map((module) => {
              const Icon = module.icon ?? LayoutGrid;
              return (
                <CommandItem
                  key={module.id}
                  onSelect={() =>
                    onNavigate(spaceModulePath(space.key, module.id))
                  }
                  value={`${module.label} ${space.name}`}
                >
                  <Icon className="mr-2 size-4 shrink-0" />
                  <span className="min-w-0 truncate">{module.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      ) : null}
      {artifacts.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup
            heading={t("spaces.artifacts.section", {
              defaultValue: "Artifacts",
            })}
          >
            {artifacts.map((artifact) => (
              <CommandItem
                key={artifact.id}
                onSelect={() =>
                  onNavigate(spaceDataArtifactPath(space.key, artifact.id))
                }
                value={`${artifact.title} ${space.name}`}
              >
                <NotebookPen className="mr-2 size-4 shrink-0" />
                <span className="min-w-0 truncate">{artifact.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
      {recentFiles.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup
            heading={t("spaces.files.section", { defaultValue: "Files" })}
          >
            {recentFiles.map((file) => (
              <CommandItem
                key={file.id}
                onSelect={() =>
                  onNavigate(
                    spaceDataFilePath(space.key, {
                      fileSpaceKey,
                      folderId: file.folderId,
                      id: file.id,
                    })
                  )
                }
                value={`${file.name} ${space.name}`}
              >
                <FileText className="mr-2 size-4 shrink-0" />
                <span className="min-w-0 truncate">{file.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
    </>
  );
}
