import { GENERAL_CHAT_AGENT_ID } from "@engenty/ai-core/browser";
import { SettingsFormSection } from "@engenty/ui-core";
import {
  BookOpen,
  Bot,
  Cable,
  ChevronRight,
  FileTerminal,
  House,
  ListChecks,
  MessagesSquare,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  buildActionsCatalogPath,
  buildActivityPath,
  buildAgentDetailPath,
  buildAgentInstructionsPath,
  buildAgentsCatalogPath,
  buildAgentsWorkspacePath,
  buildConnectionsPath,
  buildSkillsCatalogPath,
  buildToolsPath,
} from "../agents-workspace/agent-workspace-url-state";

interface CopilotAdminLinksSectionProps {
  t: (key: string) => string;
}

interface AdminLinkItem {
  Icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  labelKey: string;
  to: string;
}

function AdminLinkRow({ Icon, label, to }: AdminLinkItem & { label: string }) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
      to={to}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

export function CopilotAdminLinksSection({ t }: CopilotAdminLinksSectionProps) {
  const copilotAgentId = GENERAL_CHAT_AGENT_ID;

  const links: AdminLinkItem[] = [
    {
      Icon: Bot,
      labelKey: "copilotAdminLinks.copilotAgent",
      to: buildAgentDetailPath(copilotAgentId),
    },
    {
      Icon: BookOpen,
      labelKey: "copilotAdminLinks.instructions",
      to: buildAgentInstructionsPath(copilotAgentId),
    },
    {
      Icon: House,
      labelKey: "workspace.sidebarNavHome",
      to: buildAgentsWorkspacePath(),
    },
    {
      Icon: Bot,
      labelKey: "workspace.sidebarAgents",
      to: buildAgentsCatalogPath(),
    },
    {
      Icon: ListChecks,
      labelKey: "workspace.sidebarActions",
      to: buildActionsCatalogPath(),
    },
    {
      Icon: FileTerminal,
      labelKey: "workspace.sidebarSkills",
      to: buildSkillsCatalogPath(),
    },
    {
      Icon: Wrench,
      labelKey: "workspace.sidebarTools",
      to: buildToolsPath(),
    },
    {
      Icon: Cable,
      labelKey: "workspace.sidebarConnections",
      to: buildConnectionsPath(),
    },
    {
      Icon: MessagesSquare,
      labelKey: "workspace.sidebarActivity",
      to: buildActivityPath(),
    },
  ];

  return (
    <SettingsFormSection
      cardClassName="divide-y divide-border"
      cardVariant="flush"
      description={t("copilotAdminLinks.description")}
      title={t("copilotAdminLinks.title")}
    >
      {links.map((link) => (
        <AdminLinkRow
          Icon={link.Icon}
          key={link.to}
          label={t(link.labelKey)}
          to={link.to}
        />
      ))}
    </SettingsFormSection>
  );
}
