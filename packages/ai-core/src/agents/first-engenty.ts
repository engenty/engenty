// The first engenty of a space, and every engenty that reports to nobody
// there: the setup and hiring set on top of the catalog.
//
// One list, read on both sides: the create-space wizard and the roster's
// "Chief of Staff" suggestion write it onto the registry row so the row says
// what the agent holds, and the assembler unions it at run time for every
// hired engenty whose mount has no `reports_to` — so a lead hired blank, or
// promoted by clearing its manager, grows the team without a re-hire.

/**
 * Builtin registry tools a top-level engenty carries beyond the catalog
 * floor: it adds apps and accounts (`space_setup`), hires a teammate when a
 * job deserves its own owner (`agent_propose`, `registry_agents_list`), talks
 * to colleagues (`message_agent`, `agent_status`), gives itself standing work
 * (`routines_create`) and improves itself under approval
 * (`agent_self_revise`, `skill_propose`).
 */
export const FIRST_ENGENTY_TOOL_IDS: readonly string[] = [
  "engenty_tools_search",
  "engenty_tool_execute",
  "space_setup",
  "registry_agents_list",
  "agent_propose",
  "agent_status",
  "message_agent",
  "routines_create",
  "agent_self_revise",
  "skill_propose",
];

/** Shared Space playbook (modules/engenty-specialists) of the first engenty. */
export const FIRST_ENGENTY_SKILL_ID = "chief-of-staff";

/** Role template id of the first engenty (wizard step and roster suggestion). */
export const FIRST_ENGENTY_TEMPLATE_ID = "first-engenty";
