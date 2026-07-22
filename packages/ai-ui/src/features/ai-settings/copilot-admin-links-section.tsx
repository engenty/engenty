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

interface AdminLinkRowProps {
  description: string;
  hint?: ReactNode;
  Icon: LucideIcon;
  label: string;
  to: string;
}

interface AdminLinkConfig {
  descriptionKey: string;
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

function AdminLinkRow({
  description,
  Icon,
  hint,
  label,
  to,
}: AdminLinkRowProps) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
      to={to}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ember-tint)]">
        <Icon aria-hidden className="size-5 text-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{label}</span>
        <span className="truncate text-muted-foreground text-xs">
          {description}
        </span>
      </div>
      {hint ? (
        <span className="max-w-[40%] shrink-0 truncate text-muted-foreground text-xs tabular-nums">
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

export function CopilotAdminLinksSection() {
  const { t } = useTranslation("ai-ui");
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

  const loadingHint = t("copilotAdminLinks.hints.loading");
  const errorHint = t("copilotAdminLinks.hints.error");

  const hints = useMemo(() => {
    const agentCount = agents.length;
    const connectionCount = connectionsQuery.data ?? 0;

    return {
      agents: agentsQuery.isError
        ? errorHint
        : agentsQuery.isLoading
          ? loadingHint
          : agentCount === 0
            ? t("copilotAdminLinks.hints.agentsEmpty")
            : t("copilotAdminLinks.hints.agents", { count: agentCount }),
      actions: actionsQuery.isError
        ? errorHint
        : actionsQuery.isLoading
          ? loadingHint
          : actionCounts.total === 0
            ? t("copilotAdminLinks.hints.actionsEmpty")
            : t("copilotAdminLinks.hints.actions", {
                count: actionCounts.total,
                custom: actionCounts.custom,
              }),
      skills: skillsQuery.isError
        ? errorHint
        : skillsQuery.isLoading
          ? loadingHint
          : skillCounts.total === 0
            ? t("copilotAdminLinks.hints.skillsEmpty")
            : t("copilotAdminLinks.hints.skills", {
                custom: skillCounts.custom,
                managed: skillCounts.managed,
              }),
      tools: toolsQuery.isError
        ? errorHint
        : toolsQuery.isLoading
          ? loadingHint
          : toolCounts.total === 0
            ? t("copilotAdminLinks.hints.toolsEmpty")
            : t("copilotAdminLinks.hints.tools", {
                custom: toolCounts.custom,
                mcp: toolCounts.mcp,
                module: toolCounts.module,
              }),
      connections: connectionsQuery.isError
        ? errorHint
        : connectionsQuery.isLoading
          ? loadingHint
          : connectionCount === 0
            ? t("copilotAdminLinks.hints.connectionsEmpty")
            : t("copilotAdminLinks.hints.connections", {
                count: connectionCount,
              }),
      activity: sessionsQuery.isError
        ? errorHint
        : sessionsQuery.isLoading
          ? loadingHint
          : sessions.length === 0
            ? t("copilotAdminLinks.hints.activityEmpty")
            : t("copilotAdminLinks.hints.activity", { count: sessions.length }),
    };
  }, [
    actionCounts,
    actionsQuery.isError,
    actionsQuery.isLoading,
    agents.length,
    agentsQuery.isError,
    agentsQuery.isLoading,
    connectionsQuery.data,
    connectionsQuery.isError,
    connectionsQuery.isLoading,
    errorHint,
    loadingHint,
    sessions.length,
    sessionsQuery.isError,
    sessionsQuery.isLoading,
    skillCounts,
    skillsQuery.isError,
    skillsQuery.isLoading,
    toolCounts,
    toolsQuery.isError,
    toolsQuery.isLoading,
    t,
  ]);

  const links: AdminLinkConfig[] = [
    {
      Icon: House,
      descriptionKey: "copilotAdminLinks.rows.overview",
      labelKey: "workspace.sidebarNavHome",
      to: buildAgentsWorkspacePath(),
    },
    {
      Icon: Bot,
      descriptionKey: "copilotAdminLinks.rows.agents",
      hint: hints.agents,
      labelKey: "workspace.sidebarAgents",
      to: buildAgentsCatalogPath(),
    },
    {
      Icon: ListChecks,
      descriptionKey: "copilotAdminLinks.rows.actions",
      hint: hints.actions,
      labelKey: "workspace.sidebarActions",
      to: buildActionsCatalogPath(),
    },
    {
      Icon: FileTerminal,
      descriptionKey: "copilotAdminLinks.rows.skills",
      hint: hints.skills,
      labelKey: "workspace.sidebarSkills",
      to: buildSkillsCatalogPath(),
    },
    {
      Icon: Wrench,
      descriptionKey: "copilotAdminLinks.rows.tools",
      hint: hints.tools,
      labelKey: "workspace.sidebarTools",
      to: buildToolsPath(),
    },
    {
      Icon: Cable,
      descriptionKey: "copilotAdminLinks.rows.connections",
      hint: hints.connections,
      labelKey: "workspace.sidebarConnections",
      to: buildConnectionsPath(),
    },
    {
      Icon: MessagesSquare,
      descriptionKey: "copilotAdminLinks.rows.activity",
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
          description={t(link.descriptionKey)}
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
