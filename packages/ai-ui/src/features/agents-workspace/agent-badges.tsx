// Role + source badge pills for the agents catalog (ui-6 §"Agent role model").
//
// The identity surfaces — desk header, settings drawer, space sidebar, roster
// row — draw only {@link AgentModuleBadge}: "Specialist" and "Custom" repeat
// what the name and the mandate already say, and every non-module agent is
// custom by definition.

import { formatAgentDeskCapabilityLabel } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import {
  Bot,
  CornerDownRight,
  Cpu,
  Globe,
  Hammer,
  type LucideIcon,
  MessageCircle,
  Package,
  Sparkles,
  Workflow,
} from "lucide-react";
import type {
  AiAgentRole,
  AiAgentSource,
} from "../../lib/admin/ai-runtime-types";

type BadgeVariant = "default" | "secondary" | "outline";

const ROLE_BADGE: Record<
  AiAgentRole,
  { icon: LucideIcon; key: string; variant: BadgeVariant }
> = {
  chat_surface: {
    icon: MessageCircle,
    key: "agentsCatalog.role.chatSurface",
    variant: "outline",
  },
  coordinator: {
    icon: Workflow,
    key: "agentsCatalog.role.coordinator",
    variant: "default",
  },
  copilot: {
    icon: Sparkles,
    key: "agentsCatalog.role.copilot",
    variant: "default",
  },
  delegated: {
    icon: CornerDownRight,
    key: "agentsCatalog.role.delegated",
    variant: "outline",
  },
  external: {
    icon: Globe,
    key: "agentsCatalog.role.external",
    variant: "outline",
  },
  specialist: {
    icon: Hammer,
    key: "agentsCatalog.role.specialist",
    variant: "secondary",
  },
};

const SOURCE_BADGE: Record<
  AiAgentSource,
  { icon: LucideIcon; key: string; variant: BadgeVariant }
> = {
  builtin: {
    icon: Cpu,
    key: "agentsCatalog.source.builtin",
    variant: "secondary",
  },
  database: {
    icon: Bot,
    key: "agentsCatalog.source.custom",
    variant: "default",
  },
  module: {
    icon: Package,
    key: "agentsCatalog.source.module",
    variant: "outline",
  },
};

export function AgentRoleBadge({ role }: { role: AiAgentRole | undefined }) {
  const { t } = useTranslation("ai-ui");
  const config = ROLE_BADGE[role ?? "specialist"];
  const Icon = config.icon;
  return (
    <Badge className="gap-1 whitespace-nowrap" variant={config.variant}>
      <Icon aria-hidden className="size-3" />
      {t(config.key)}
    </Badge>
  );
}

export function AgentSourceBadge({
  moduleId,
  source,
}: {
  moduleId?: string | null;
  source: AiAgentSource | undefined;
}) {
  const { t } = useTranslation("ai-ui");
  const config = SOURCE_BADGE[source ?? "database"];
  const Icon = config.icon;
  return (
    <Badge className="gap-1 whitespace-nowrap" variant={config.variant}>
      <Icon aria-hidden className="size-3" />
      {source === "module" && moduleId
        ? t("agentsCatalog.source.moduleWithId", { module: moduleId })
        : t(config.key)}
    </Badge>
  );
}

/**
 * The module an agent ships with, as the pill that follows its name. Pass
 * `label` where the caller knows the module's display name (the rail's own
 * label); the id is formatted as a fallback.
 */
export function AgentModuleBadge({
  className,
  label,
  moduleId,
}: {
  className?: string;
  label?: string | null;
  moduleId: string;
}) {
  return (
    <Badge
      className={cn("gap-1 whitespace-nowrap", className)}
      variant="outline"
    >
      <Package aria-hidden className="size-3" />
      {label?.trim() || formatAgentDeskCapabilityLabel(moduleId)}
    </Badge>
  );
}
