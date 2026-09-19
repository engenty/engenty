# The hire dialog — draft in, registry row out

The Space's "+ New agent" opens the hire wizard. One focused step: character,
name, description, then Get started; role templates sit underneath as
Suggestions. Code (apps/ui, `components/spaces/`):

| Piece | File |
| --- | --- |
| Opener ("+" menu → New agent / New group chat) | `SpaceAgentHireTrigger.tsx` |
| Dialog shell, navigates to the desk on success | `SpaceAgentHireWizard.tsx` |
| Fields and the form hook (`useSpaceAgentHireForm`) | `SpaceAgentHireForm.tsx` |
| Draft → registry payload | `space-agent-hire.ts` |
| Character picker | `SpaceAgentHireCharacter.tsx` |
| "Comes with" — the floor, read-only | `SpaceAgentHireCapabilities.tsx` |

Flow: the hook holds `{ name, description, engenty, template, reportsTo }`
→ `buildSpaceAgentHireInput` → `useCreateCustomAgentMutation` →
`POST /ai/registry/agents` (`registry-routes.ts`) with `spaceIds` and
`reportsTo`, so create and mount are one call; the form errors if `mounted`
has no row for this Space. Only a non-empty name is required.

## Character (engenty)

Ten silhouettes, `AGENT_ENGENTY_KINDS` (`ai/floor.ts`): round, drop, dome,
flame, oval, bean, pebble, sprout, tower, wedge. Rendered by `<Engenty>` in
`@engenty/ui-core` (inline SVG, SMIL idle morph, pointer gaze). Colour is
**not** a choice — it is bound to the silhouette (`ENGENTY_KIND_FILL` →
`ENGENTY_FILL`, oklch derived from brand tokens). The dialog opens on a
random kind; a picked template overrides it (`HIRE_TEMPLATE_ENGENTY`). No
stored kind → hashed from the agent id (`resolveAgentEngenty`).

Elsewhere an agent may wear a generated portrait: `AgentFace` shows
`avatarUrl` (a signed storage key) and falls back to the blob. The agent
changes its own look with `agent_look`, human-approved. The dialog has no
portrait upload.

## Tools and skills — three layers, none a picker

1. **Floor** — `LIVE_HIRE_TOOL_IDS` + `LIVE_HIRE_SKILL_IDS`. Never written
   to the row; unioned at assembly. Shown as "Comes with N tools".
2. **Template** — a Suggestion sets `toolIds` / `skillIds`:
   `AGENT_ROLE_TEMPLATES` (`packages/ai-ui`, `agent-form/agent-role-templates.ts`
   — each `[engenty_tools_search, engenty_tool_execute]` plus at most one
   extra) and `firstEngentyDraft()` for the Chief of Staff, which carries
   `FIRST_ENGENTY_TOOL_IDS` + `chief-of-staff`.
3. **No template** — the row gets `[engenty_tools_search,
   engenty_tool_execute]` and no skills; the description seeds the
   instructions (`hireInstructions`) so the agent is not born with a
   one-liner.

Runtime resolution is `ai/policy.ts` (see floor-and-gating.md): every
specialist gets the floor; an engenty whose mount has no `reports_to` also
gets the top-level set, whatever its row says.
