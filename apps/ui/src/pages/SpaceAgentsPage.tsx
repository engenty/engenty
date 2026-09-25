/**
 * `/s/<key>/agents` — the space's agent roster as a page.
 *
 * The Work-tab heading links here. The sidebar lists the same agents (via
 * {@link useSpaceRosterAgents}); this is the roomier view of who works in
 * the space, each row opening that agent's Desk. Copilot has its own
 * root-level home, not a resident of this roster.
 */
import {
  agentDeskCapabilityChips,
  formatAgentDeskCapabilityLabel,
} from "@engenty/ai-core/browser";
import { AgentProposalsCard } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  DetailPageHeader,
  Spinner,
  uiPageScrollClassName,
} from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { Sparkles } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { SpaceAgentHireTrigger } from "@/components/spaces/SpaceAgentHireTrigger";
import { SpaceAgentRosterRow } from "@/components/spaces/space-agent-roster-row";
import {
  buildSpaceAgentTree,
  type SpaceAgentTreeNode,
} from "@/components/spaces/space-agent-tree";
import { SpaceAgentsEmpty } from "@/components/spaces/space-agents-empty";
import { resolveSpaceAgentDestination } from "@/lib/space-agent-nav";
import { spaceRootPath } from "@/lib/space-routes";
import {
  useSpaceConnectorCatalogQuery,
  useSpaceSkillCatalogQuery,
  useSpacesQuery,
} from "@/lib/spaces-queries";
import { useAskCopilotSidebar } from "@/lib/use-ask-copilot-sidebar";
import { useSpaceModules } from "@/lib/use-space-modules";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

export function SpaceAgentsPage() {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams<{ spaceKey: string }>();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const { agents, connectors, isPending } = useSpaceRosterAgents(
    space?.id ?? null
  );
  const { modules } = useSpaceModules(space?.id ?? null);
  const skillsQuery = useSpaceSkillCatalogQuery(space != null);
  const connectorCatalogQuery = useSpaceConnectorCatalogQuery(space != null);
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  const canHire = canManage || Boolean(space?.ownerUserId);
  const askCopilot = useAskCopilotSidebar();

  const skillLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const skill of skillsQuery.data ?? []) {
      labels.set(skill.name, skill.title ?? skill.name);
    }
    return labels;
  }, [skillsQuery.data]);

  const connectorLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const connector of connectorCatalogQuery.data ?? []) {
      labels.set(
        connector.id,
        connector.title ?? connector.name ?? connector.id
      );
    }
    return labels;
  }, [connectorCatalogQuery.data]);

  // A module agent's pill names its module the way the space sidebar does.
  const moduleLabels = useMemo(
    () => new Map(modules.map((module) => [module.id, module.label] as const)),
    [modules]
  );

  const connectorChips = useMemo(
    () =>
      agentDeskCapabilityChips(connectors).map((chip) => ({
        ...chip,
        label:
          connectorLabels.get(chip.id) ??
          formatAgentDeskCapabilityLabel(chip.id),
      })),
    [connectorLabels, connectors]
  );

  const tree = useMemo(() => buildSpaceAgentTree(agents), [agents]);

  const rowFor = (agent: (typeof agents)[number], badge?: ReactNode) => (
    <SpaceAgentRosterRow
      agent={agent}
      badge={badge}
      connectorChips={connectorChips}
      href={resolveSpaceAgentDestination(agent.id, spaceKey)}
      key={agent.id}
      moduleLabel={
        agent.managedByModule
          ? moduleLabels.get(agent.managedByModule)
          : undefined
      }
      skillChips={agentDeskCapabilityChips(agent.skillIds).map((chip) => ({
        ...chip,
        label:
          skillLabels.get(chip.id) ?? formatAgentDeskCapabilityLabel(chip.id),
      }))}
    />
  );

  // A coordinator and, indented under it, the teammates that report to it —
  // recursively, since a report may have reports of its own. The hire action
  // on a coordinator presets who the new hire reports to (D8).
  const renderNode = (node: SpaceAgentTreeNode, depth: number): ReactNode => (
    <div className="flex flex-col gap-2.5" key={node.agent.id}>
      {rowFor(
        node.agent,
        depth === 0 ? (
          <Badge variant="outline">
            {t("spaces.agents.coordinator", { defaultValue: "Coordinator" })}
          </Badge>
        ) : undefined
      )}
      {node.reports.length > 0 || (depth === 0 && canHire) ? (
        <div className="ml-6 flex flex-col gap-2.5 border-border-soft border-l pl-4">
          {node.reports.map((report) => renderNode(report, depth + 1))}
          {depth === 0 && canHire ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <SpaceAgentHireTrigger
                reportsTo={node.agent.id}
                spaceId={space?.id ?? null}
                spaceKey={spaceKey}
                variant="outline"
              />
              <span>
                {t("spaces.agents.hireReport", {
                  defaultValue: "Hire a teammate for {{name}}",
                  name: node.agent.name,
                })}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [{ label: t("spaces.agents.section", { defaultValue: "Agents" }) }],
    [t]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button onClick={() => askCopilot()} size="sm" variant="outline">
          <Sparkles className="mr-1.5 size-3.5" />
          {t("spaces.agents.askAi", { defaultValue: "Ask AI" })}
        </Button>
        {canHire ? (
          <SpaceAgentHireTrigger
            spaceId={space?.id ?? null}
            spaceKey={spaceKey}
            variant="button"
          />
        ) : null}
      </div>
    ),
    [askCopilot, canHire, space?.id, spaceKey, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarOverlap: true,
  });

  if (!(spacesQuery.isPending || space)) {
    return <Navigate replace to={spaceRootPath(spaceKey)} />;
  }

  return (
    <div className={uiPageScrollClassName}>
      <DetailPageHeader
        description={
          <p>
            {t("spaces.agents.intro", {
              defaultValue:
                "Agents are workers that never sleep. Each one handles a job in this space on its own — routing work, sending reports, or keeping records current.",
            })}
          </p>
        }
        maxWidth="5xl"
        title={t("spaces.agents.section", { defaultValue: "Agents" })}
        variant="canvas"
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2.5 px-page pb-10">
        {/* Proposed hires and revisions are decided here, where the roster
            is — the bell only points at this page. Renders nothing when
            nothing waits. */}
        {canManage ? <AgentProposalsCard /> : null}
        {isPending || spacesQuery.isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner className="size-4" />
            {t("spaces.agents.loading", { defaultValue: "Loading agents…" })}
          </div>
        ) : agents.length === 0 ? (
          <SpaceAgentsEmpty
            hireAction={
              canHire ? (
                <SpaceAgentHireTrigger
                  spaceId={space?.id ?? null}
                  spaceKey={spaceKey}
                  variant="outline"
                />
              ) : undefined
            }
            onAskAi={() => askCopilot()}
          />
        ) : (
          <nav
            aria-label={t("spaces.agents.section", { defaultValue: "Agents" })}
            className="flex flex-col gap-2.5"
          >
            {tree.coordinators.map((node) => renderNode(node, 0))}
            {tree.fromApps.length > 0 ? (
              <>
                <h2 className="mt-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t("spaces.agents.fromApps", { defaultValue: "From apps" })}
                </h2>
                {tree.fromApps.map((agent) => rowFor(agent))}
              </>
            ) : null}
          </nav>
        )}
      </div>
    </div>
  );
}
