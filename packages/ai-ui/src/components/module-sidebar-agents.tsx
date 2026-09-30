import { resolveAgentEngenty } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import {
  cn,
  SidebarGroup,
  SidebarGroupContent,
  SidebarRowTitleMarquee,
} from "@engenty/ui-core";
import { useWorkspaceSpace } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { spaceAgentDeskPath } from "../features/agent-form/hire-spaces.js";
import { useAiAgentsQuery } from "../lib/admin/ai-runtime-queries.js";
import type { AiRegisteredAgent } from "../lib/admin/ai-runtime-types.js";
import { AgentFace } from "./agent-face.js";

/**
 * A module's own Engentys, for its sidebar: each row opens that agent's desk
 * in the current Space. Renders nothing outside a Space or when the module
 * ships no agent.
 */
export function ModuleSidebarAgents({ moduleId }: { moduleId: string }) {
  const space = useWorkspaceSpace();
  const { pathname } = useLocation();
  const agentsQuery = useAiAgentsQuery(space != null);
  const agents = useMemo(
    () =>
      (agentsQuery.data?.agents ?? [])
        .filter(
          (agent) =>
            agent.source !== "builtin" &&
            (agent.managed_by_module ?? agent.module_id) === moduleId
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [agentsQuery.data, moduleId]
  );

  if (!space || agents.length === 0) {
    return null;
  }
  return (
    <SidebarGroup className="p-0 pt-2">
      <SidebarGroupContent>
        <div className="flex flex-col gap-0.5">
          {agents.map((agent) => {
            const to = spaceAgentDeskPath(space.key, agent.id);
            return (
              <ModuleAgentRow
                active={pathname === to || pathname.startsWith(`${to}/`)}
                agent={agent}
                key={agent.id}
                to={to}
              />
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Same look as a desk row in the Space sidebar: blob, name, one muted line. */
function ModuleAgentRow({
  active,
  agent,
  to,
}: {
  active: boolean;
  agent: AiRegisteredAgent;
  to: string;
}) {
  const [hovered, setHovered] = useState(false);
  const line = agent.description?.trim();
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
        "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        active ? "bg-muted font-semibold" : "hover:bg-muted/60"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      to={to}
      {...shellSecondaryNavItemProps}
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center overflow-visible"
      >
        <AgentFace
          animated={active}
          avatarUrl={agent.avatarUrl}
          className="[&_.e-shadow]:hidden"
          kind={resolveAgentEngenty(agent.id, agent.engenty)}
          name={agent.name}
          size={38}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0 leading-none">
        <span className="truncate leading-snug" title={agent.name}>
          {agent.name}
        </span>
        {line ? (
          <SidebarRowTitleMarquee
            active={hovered}
            className="block"
            text={line}
            textClassName="font-normal text-muted-foreground text-xs leading-snug"
          />
        ) : null}
      </span>
    </Link>
  );
}
