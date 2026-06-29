import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import {
  cn,
  Input,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import type { WorkspaceNavPrimaryTab } from "./workspace-nav-utils";

export interface WorkspaceNavTabHeaderProps {
  agentsCatalogSearch: string;
  onAgentsCatalogSearchChange: (value: string) => void;
  onPrimaryTabChange: (tab: WorkspaceNavPrimaryTab) => void;
  onSessionsCatalogSearchChange: (value: string) => void;
  primaryTab: WorkspaceNavPrimaryTab;
  sessionsCatalogSearch: string;
  t: (key: string) => string;
}

export function WorkspaceNavTabHeader({
  agentsCatalogSearch,
  onAgentsCatalogSearchChange,
  onPrimaryTabChange,
  onSessionsCatalogSearchChange,
  primaryTab,
  sessionsCatalogSearch,
  t,
}: WorkspaceNavTabHeaderProps) {
  const tabStripTriggerBase =
    "gap-0 rounded-none border-0 py-0 text-xs shadow-none data-[state=active]:shadow-none";

  return (
    <div className="shrink-0">
      <div className="border-border/60 border-b">
        <Tabs
          className="gap-0"
          onValueChange={(value) =>
            onPrimaryTabChange(value as WorkspaceNavPrimaryTab)
          }
          value={primaryTab}
        >
          <TabsList className="flex h-9 w-full min-w-0 flex-row gap-0 rounded-none bg-muted/45 p-0 shadow-none">
            <TabsTrigger
              className={`${tabStripTriggerBase} min-w-0 flex-1 px-1`}
              value="agents"
            >
              {t("workspace.sidebarAgents")}
            </TabsTrigger>
            <TabsTrigger
              className={`${tabStripTriggerBase} min-w-0 flex-1 px-1`}
              value="sessions"
            >
              {t("workspace.sidebarSessions")}
            </TabsTrigger>
            <TabsTrigger
              className={`${tabStripTriggerBase} min-w-0 flex-1 px-1`}
              value="skills"
            >
              {t("workspace.sidebarSkills")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {primaryTab === "agents" || primaryTab === "sessions" ? (
        <div
          className={cn(
            "flex items-center gap-1 py-2",
            sidebarColumnContentInsetClassName,
            sidebarColumnContentInsetEndClassName
          )}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={
                primaryTab === "sessions"
                  ? t("workspace.sidebarSessionsSearchAria")
                  : t("workspace.sidebarCatalogSearchAria")
              }
              className="h-8 w-full py-0 pr-3 pl-7 text-xs"
              onChange={(e) =>
                primaryTab === "sessions"
                  ? onSessionsCatalogSearchChange(e.target.value)
                  : onAgentsCatalogSearchChange(e.target.value)
              }
              placeholder={
                primaryTab === "sessions"
                  ? t("workspace.sidebarSessionsSearchPlaceholder")
                  : t("workspace.sidebarCatalogSearchPlaceholder")
              }
              type="search"
              value={
                primaryTab === "sessions"
                  ? sessionsCatalogSearch
                  : agentsCatalogSearch
              }
              {...shellSecondaryNavItemProps}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
