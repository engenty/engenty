/**
 * One agent on `/s/<key>/agents` — identity row matching the Desk header:
 * character, then name with its module pill (or its position badge) after
 * it, description, and the skill and connector chips. Who reports to whom is
 * the page's tree, not a caption. The whole row opens that agent's Desk.
 */
import { AgentFace, AgentModuleBadge } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn, uiCardRaisedClassName } from "@engenty/ui-core";
import { Cable, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";

function ChipRow({
  chips,
  icon,
  label,
}: {
  chips: { id: string; label: string }[];
  icon: ReactNode;
  label: string;
}) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        {icon}
        {label}
      </span>
      {chips.map((chip) => (
        <Badge key={chip.id} variant="secondary">
          {chip.label}
        </Badge>
      ))}
    </span>
  );
}

export function SpaceAgentRosterRow({
  agent,
  badge,
  connectorChips,
  href,
  moduleLabel,
  skillChips,
}: {
  agent: SpaceRosterAgent;
  /** The position this agent holds here, e.g. "Coordinator". */
  badge?: ReactNode;
  connectorChips: { id: string; label: string }[];
  href: string;
  /** Display name of `agent.managedByModule`, as the sidebar labels it. */
  moduleLabel?: string;
  skillChips: { id: string; label: string }[];
}) {
  const { t } = useTranslation("common");
  const description = agent.description?.trim() ?? "";

  return (
    <Link
      className={cn(
        uiCardRaisedClassName,
        "flex min-w-0 items-start gap-4 px-4 py-3.5"
      )}
      to={href}
    >
      <span
        aria-hidden
        className="grid size-[60px] shrink-0 place-items-center overflow-visible"
      >
        <AgentFace
          avatarUrl={agent.avatarUrl}
          className="[&_.e-shadow]:hidden"
          kind={agent.engenty}
          name={agent.name}
          size={60}
        />
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate font-semibold text-base">
            {agent.name}
          </span>
          {agent.source === "module" && agent.managedByModule ? (
            <AgentModuleBadge
              label={moduleLabel}
              moduleId={agent.managedByModule}
            />
          ) : null}
          {badge}
        </span>
        {description ? (
          <span className="line-clamp-2 block text-muted-foreground text-sm leading-relaxed">
            {description}
          </span>
        ) : null}
        {skillChips.length > 0 || connectorChips.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <ChipRow
              chips={skillChips}
              icon={<Sparkles className="size-3" />}
              label={t("spaces.agents.skills", { defaultValue: "Skills" })}
            />
            <ChipRow
              chips={connectorChips}
              icon={<Cable className="size-3" />}
              label={t("spaces.agents.connectors", {
                defaultValue: "Connectors",
              })}
            />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
