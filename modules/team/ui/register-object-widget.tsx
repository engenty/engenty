"use client";

import { registerObjectWidget } from "@engenty/ai-ui";
import { TeamMemberObjectCard } from "./components/copilot/team-member-object-card.js";

const MEMBER_DETAIL_PATTERN =
  /^\/mdl\/team\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

let registered = false;

export function registerTeamObjectWidget() {
  if (registered) {
    return;
  }
  registered = true;

  registerObjectWidget({
    id: "team.member",
    module: "team",
    entity: "member",
    card: TeamMemberObjectCard,
    getHref: (ref) => `/mdl/team/${ref.id}`,
    matchHref: (pathname) => {
      const match = pathname.match(MEMBER_DETAIL_PATTERN);
      return match ? { module: "team", entity: "member", id: match[1] } : null;
    },
  });
}
