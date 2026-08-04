import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { TeamMemberListItem } from "../api.js";
import type { TeamAgentCatalogRow } from "./use-team-agents-catalog-query.js";

function memberLabel(member: Pick<TeamMemberListItem, "full_name" | "id">) {
  return member.full_name?.trim() || member.id;
}

export function useTeamMembersListAgentUiSlice(input: {
  members: TeamMemberListItem[];
  search: string;
  total: number;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.members.slice(0, 10).map((m) => ({
      id: m.id,
      label: memberLabel(m),
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Team members",
          page_description: q
            ? `Team members list filtered by search (${input.total} total).`
            : `Team members list (${input.total} total).`,
          list_search: q,
          list_total: input.total,
          list_preview: preview,
        }),
      },
    };
  }, [input.members, input.search, input.total]);

  useRegisterAgentUiSlice("team.members", slice);
}

export function useTeamMemberDetailAgentUiSlice(
  member: TeamMemberListItem | null
) {
  const slice = useMemo(() => {
    if (!member) {
      return null;
    }
    const title = memberLabel(member);
    const role = member.role_term?.trim() || member.position?.trim();
    const dept = member.department?.trim();
    const bits = [
      role ? `role ${role}` : null,
      dept ? `department ${dept}` : null,
    ].filter(Boolean);
    const detail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: `Viewing team member ${title}${detail}.`,
        }),
        team_member_snapshot: {
          id: member.id,
          label: title,
          position: member.position,
          department: member.department,
          email: member.email,
        },
      },
      selection: {
        entity_id: member.id,
        entity_type: "team_member",
      },
    };
  }, [member]);

  useRegisterAgentUiSlice("team.member-detail", slice);
}

export function useTeamMemberEditAgentUiSlice(input: {
  dirty: boolean;
  member: TeamMemberListItem | null;
}) {
  const slice = useMemo(() => {
    if (!input.member) {
      return null;
    }
    const title = memberLabel(input.member);
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: title,
          page_description: input.dirty
            ? `Editing team member ${title} (unsaved changes).`
            : `Editing team member ${title}.`,
        }),
        team_member_snapshot: {
          id: input.member.id,
          label: title,
        },
      },
      selection: {
        entity_id: input.member.id,
        entity_type: "team_member",
      },
    };
  }, [input.dirty, input.member]);

  useRegisterAgentUiSlice("team.member-edit", slice);
}

export function useTeamAgentsListAgentUiSlice(input: {
  agents: TeamAgentCatalogRow[];
}) {
  const slice = useMemo(() => {
    const preview = input.agents.slice(0, 10).map((a) => ({
      id: a.id,
      label: a.name?.trim() || a.id,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Team agents",
          page_description: `AI agents catalog for the team (${input.agents.length} total).`,
          list_total: input.agents.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.agents]);

  useRegisterAgentUiSlice("team.agents", slice);
}

export function useTeamAgentDetailAgentUiSlice(
  agent: TeamAgentCatalogRow | null | undefined
) {
  const slice = useMemo(() => {
    if (!agent) {
      return null;
    }
    const title = agent.name?.trim() || agent.id;
    const skillCount = agent.skills.length;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: `Viewing team agent ${title} (${skillCount} skill(s)).`,
        }),
        team_agent_snapshot: {
          id: agent.id,
          label: title,
          module_id: agent.module_id,
          role: agent.role,
        },
      },
      selection: {
        entity_id: agent.id,
        entity_type: "team_agent",
      },
    };
  }, [agent]);

  useRegisterAgentUiSlice("team.agent-detail", slice);
}

export function useTeamGraphAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "graph",
          page_title: "Team graph",
          page_description: "Team org chart / reporting graph.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("team.graph", slice);
}

export function useTeamSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Team settings",
          page_description:
            "Team taxonomies settings (roles, locations, custom terms).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("team.settings", slice);
}

export function useTeamGlobalSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Team global settings",
          page_description:
            "Team global settings for member field definitions.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("team.global-settings", slice);
}

export function useTeamImportAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "import",
          page_title: "Import team members",
          page_description: "CSV import wizard for team members.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("team.import", slice);
}
