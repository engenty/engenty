import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Bot, Wrench, Zap } from "lucide-react";
import { useParams } from "react-router-dom";
import { TeamModulePageScroll } from "../components/team-module-page-scroll.js";
import { useTeamAgentsCatalogQuery } from "../hooks/use-team-agents-catalog-query.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { TEAM_AGENTS_PATH } from "../team-paths.js";

export function TeamAgentDetailPage() {
  const { t } = useTranslation("team");
  const { agentId = "" } = useParams();
  const shellNav = useTeamModuleSecondaryShellNav();
  const { agents, isLoading } = useTeamAgentsCatalogQuery();
  const agent = agents.find((row) => row.id === agentId);

  usePageConfig({
    breadcrumbs: [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: t("sidebar.nav_agents"), to: TEAM_AGENTS_PATH },
      { label: agent?.name ?? (agentId || "…") },
    ],
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  if (isLoading) {
    return (
      <TeamModulePageScroll innerClassName="mx-auto w-full max-w-3xl space-y-6 p-page pb-10">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-32 w-full" />
      </TeamModulePageScroll>
    );
  }

  if (!agent) {
    return (
      <TeamModulePageScroll innerClassName="mx-auto w-full max-w-3xl space-y-4 p-page pb-10">
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Agent not found.
        </div>
      </TeamModulePageScroll>
    );
  }

  return (
    <TeamModulePageScroll innerClassName="mx-auto w-full max-w-3xl space-y-6 p-page pb-10">
      <div className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
          <Bot className="size-8 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-2xl tracking-tight">
            {agent.name}
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{agent.module_id}</Badge>
            {agent.agent_origin === "custom" && (
              <Badge variant="outline">Custom</Badge>
            )}
            {agent.agent_origin === "registry" && (
              <Badge variant="outline">Registry</Badge>
            )}
          </div>
        </div>
      </div>

      {agent.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm leading-relaxed">
            {agent.description}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4" />
              Skills ({agent.skills.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.skills.length > 0 ? (
              <ul className="flex flex-col gap-2 text-muted-foreground text-sm">
                {agent.skills.map((skillId) => (
                  <li className="flex items-center gap-2" key={skillId}>
                    <div className="size-1.5 rounded-full bg-primary/50" />
                    {skillId}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                No specific skills assigned.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4" />
              Tools ({agent.tools?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.tools && agent.tools.length > 0 ? (
              <ul className="flex flex-col gap-2 text-muted-foreground text-sm">
                {agent.tools.map((toolId) => (
                  <li className="flex items-center gap-2" key={toolId}>
                    <div className="size-1.5 rounded-full bg-primary/50" />
                    {toolId}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                No specific tools assigned.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TeamModulePageScroll>
  );
}
