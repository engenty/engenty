// The catalog floor of a hired engenty — what every specialist carries
// whatever its row declares — and the lanes that ride with its skills.
//
// Browser-safe: the hire wizard shows the floor as "Comes with", the
// agent-face and the roster read the engenty kinds. The constants stay
// PHYSICALLY in `@engenty/ai-core` (agents/hire-floor.ts, first-engenty.ts,
// agent-engenty.ts): ai-core is what apps/ui already bundles through
// `@engenty/ai-core/browser`, and ai-core depending on this module for them
// would be a dependency cycle (this module needs ai-core's contract types).
// This file is the documented entry — one place to read what the floor is —
// and re-exports are what keep the two in step: a symbol added there and not
// here is a symbol nobody finds.
// biome-ignore lint/performance/noBarrelFile: the documented floor entry.
export {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TEMPLATE_ID,
  FIRST_ENGENTY_TOOL_IDS,
  isAgentEngentyKind,
  LIVE_HIRE_ATTACHED_TOOL_IDS,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
  resolveAgentEngenty,
  SPECIALIST_TOOL_GATING,
} from "@engenty/ai-core/browser";
