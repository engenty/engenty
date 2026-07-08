import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { SettingsFormSection } from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Cable,
  ChevronRight,
  FileTerminal,
  House,
  ListChecks,
  MessagesSquare,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useAdminAiSessionsQuery,
  useAiActionsQuery,
  useAiAgentsQuery,
  useAiSkillsQuery,
  useAiToolsQuery,
} from "../../lib/admin/ai-runtime-queries";
import {
  countActions,
  countSkills,
  countTools,
} from "../admin-overview/overview-counts";
import {
  buildActionsCatalogPath,
  buildActivityPath,
  buildAgentsCatalogPath,
  buildAgentsWorkspacePath,
  buildConnectionsPath,
  buildSkillsCatalogPath,
  buildToolsPath,
} from "../agents-workspace/agent-workspace-url-state";

interface CopilotAdminLinksSectionProps {
  t: (key: string) => string;
}

interface AdminLinkRowProps {
  hint?: ReactNode;
  Icon: LucideIcon;
  label: string;
  to: string;
}

interface AdminLinkConfig {
  hint?: ReactNode;
  Icon: LucideIcon;
  labelKey: string;
  to: string;
}

interface PanelConnectionRow {
  connection: { id: string };
}

function useWorkspaceConnectionsCount() {
  return useQuery({
    queryFn: async () => {
      const catalog = await requestApiJson<{
        connectors: Array<{ connections: PanelConnectionRow["connection"][] }>;
      }>("/api/tools/connections_catalog/invoke", {
        body: { input: {} },
        method: "POST",
      });
      return catalog.connectors.reduce(
        (sum, connector) => sum + connector.connections.length,
        0
      );
    },
    queryKey: ["ai-ui", "copilot-admin-links", "connections-count"],
    staleTime: 30_000,
  });
}

function AdminLinkRow({ Icon, hint, label, to }: AdminLinkRowProps) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
      to={to}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {hint ? (
        <span className="max-w-[45%] shrink-0 truncate text-muted-foreground text-xs tabular-nums">
          {hint}
        </span>
      ) : null}
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

export function CopilotAdminLinksSection({ t }: CopilotAdminLinksSectionProps) {
  const { t: tUi } = useTranslation("ai-ui");
  const agentsQuery = useAiAgentsQuery();
  const actionsQuery = useAiActionsQuery();
  const skillsQuery = useAiSkillsQuery();
  const toolsQuery = useAiToolsQuery();
  const sessionsQuery = useAdminAiSessionsQuery(null, false);
  const connectionsQuery = useWorkspaceConnectionsCount();

  const agents = agentsQuery.data?.agents ?? [];
  const actions = actionsQuery.data?.actions ?? [];
  const skills = skillsQuery.data?.skills ?? [];
  const tools = toolsQuery.data?.tools ?? [];
  const sessions = sessionsQuery.data?.sessions ?? [];

  const actionCounts = useMemo(() => countActions(actions), [actions]);
  const skillCounts = useMemo(() => countSkills(skills), [skills]);
  const toolCounts = useMemo(() => countTools(tools), [tools]);

  const loadingHint = tUi("copilotAdminLinks.hints.loading");

  const hints = useMemo(() => {
    const agentCount = agents.length;
    const connectionCount = connectionsQuery.data ?? 0;

    return {
      overview: tUi("copilotAdminLinks.hints.overview"),
      agents: agentsQuery.isLoading
        ? loadingHint
        : agentCount === 0
          ? tUi("copilotAdminLinks.hints.agentsEmpty")
          : tUi("copilotAdminLinks.hints.agents", { count: agentCount }),
      actions: actionsQuery.isLoading
        ? loadingHint
        : actionCounts.total === 0
          ? tUi("copilotAdminLinks.hints.actionsEmpty")
          : tUi("copilotAdminLinks.hints.actions", {
              count: actionCounts.total,
              custom: actionCounts.custom,
            }),
      skills: skillsQuery.isLoading
        ? loadingHint
        : skillCounts.total === 0
          ? tUi("copilotAdminLinks.hints.skillsEmpty")
          : tUi("copilotAdminLinks.hints.skills", {
              custom: skillCounts.custom,
              managed: skillCounts.managed,
            }),
      tools: toolsQuery.isLoading
        ? loadingHint
        : toolCounts.total === 0
          ? tUi("copilotAdminLinks.hints.toolsEmpty")
          : tUi("copilotAdminLinks.hints.tools", {
              custom: toolCounts.custom,
              mcp: toolCounts.mcp,
              module: toolCounts.module,
            }),
      connections: connectionsQuery.isLoading
        ? loadingHint
        : connectionCount === 0
          ? tUi("copilotAdminLinks.hints.connectionsEmpty")
          : tUi("copilotAdminLinks.hints.connections", {
              count: connectionCount,
            }),
      activity: sessionsQuery.isLoading
        ? loadingHint
        : sessions.length === 0
          ? tUi("copilotAdminLinks.hints.activityEmpty")
          : tUi("copilotAdminLinks.hints.activity", { count: sessions.length }),
    };
  }, [
    actionCounts,
    actionsQuery.isLoading,
    agents.length,
    agentsQuery.isLoading,
    connectionsQuery.data,
    connectionsQuery.isLoading,
    loadingHint,
    sessions.length,
    sessionsQuery.isLoading,
    skillCounts,
    skillsQuery.isLoading,
    toolCounts,
    toolsQuery.isLoading,
    tUi,
  ]);

  const links: AdminLinkConfig[] = [
    {
      Icon: House,
      hint: hints.overview,
      labelKey: "workspace.sidebarNavHome",
      to: buildAgentsWorkspacePath(),
    },
    {
      Icon: Bot,
      hint: hints.agents,
      labelKey: "workspace.sidebarAgents",
      to: buildAgentsCatalogPath(),
    },
    {
      Icon: ListChecks,
      hint: hints.actions,
      labelKey: "workspace.sidebarActions",
      to: buildActionsCatalogPath(),
    },
    {
      Icon: FileTerminal,
      hint: hints.skills,
      labelKey: "workspace.sidebarSkills",
      to: buildSkillsCatalogPath(),
    },
    {
      Icon: Wrench,
      hint: hints.tools,
      labelKey: "workspace.sidebarTools",
      to: buildToolsPath(),
    },
    {
      Icon: Cable,
      hint: hints.connections,
      labelKey: "workspace.sidebarConnections",
      to: buildConnectionsPath(),
    },
    {
      Icon: MessagesSquare,
      hint: hints.activity,
      labelKey: "workspace.sidebarActivity",
      to: buildActivityPath(),
    },
  ];

  return (
    <SettingsFormSection
      cardClassName="space-y-0 divide-y divide-border"
      cardVariant="flush"
      description={t("copilotAdminLinks.description")}
      title={t("copilotAdminLinks.title")}
    >
      {links.map((link) => (
        <AdminLinkRow
          hint={link.hint}
          Icon={link.Icon}
          key={link.to}
          label={t(link.labelKey)}
          to={link.to}
        />
      ))}
    </SettingsFormSection>
  );
}
