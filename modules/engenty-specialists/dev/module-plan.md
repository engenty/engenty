# engenty-specialists — a builtin module as the home of hired engenties

Status: DONE 2026-09-19 on `feat/engenty-specialists` (phases 1–5). Kept as
history in the module's `dev/`; the live description of the module is its
`AGENTS.md` and the other notes in this directory.

Decisions taken (§6): public mirror open, like the copilot; dependency
direction ai-core → constants stay physically in ai-core, `ai/floor.ts` is
the documented entry (this module needs ai-core's contract types, so the
reverse would be a cycle); seed source `engenty-specialists`. Phases 3 and 4
landed as one commit — each alone would have been an unbuildable step.
Not done, deliberately: the `apps/ui` alias for `./ai/floor` (the UI keeps
reading ai-core/browser until `ui/` exists).

---

## 1. Why

Hired engenties (`kind === "specialist"`, `source === "database"`) are a
platform concept, but their code sits in six places: `packages/ai-core`
(floor lists), `apps/ai/ai/tools` (policy + verbs), `apps/ai/src/ai/registry`
(assembly), `apps/ai/src/ai/instructions` (appendix), `packages/ai-skills`
(chief-of-staff), and — until the running worktree moves them — the copilot
module (the lane skills a specialist is now allowed to load).

`engenty-copilot` and `engenty-remote` already show the shape we want: one
directory per product concept with `ai/`, `ui/`, `locales/`, `dev/`. The
copilot is the precedent for a **builtin, never-mounted** module used as a
code home ("Stays builtin; not on `defineModuleAi`",
`modules/engenty-copilot/AGENTS.md`). `engenty-specialists` copies that
recipe exactly. It is code organisation and DX; runtime behaviour is
unchanged by this plan.

Not a runtime module: nothing here is mount-gated. A floor skill must exist in
every Space, so the module's skills are seeded by name through a dedicated
loop (like `ENGENTY_COPILOT_MANAGED_SKILLS`), never through the module
capability channel that `allowed-skills.ts` filters by mount.

## 2. Prerequisite (Phase 0 — done on `feat/hired-routines`, not yet on main)

Landed there as of 2026-09-19 (rebased on `main`, 0 behind, not pushed):

- `a47989508` five copilot skills → `packages/ai-skills/ai/skills/spaces/`;
  copilot seed loop removed from `tenant-skills-seed.ts`
- `77979bdcb` `routines_create` / `routines_update` prompt lane, caller
  scope (`engenty-tools/lib/caller-scope.ts`), approval by mode
  (`routine-approval.ts`), self-publish, desk note + `routine_created`
  inbox row
- `27263e622` `routines` skill; `durable-work` keeps the Tasks
- `a0b6b73bd` floor += `routines_create`, `workflow_propose`, `routines`;
  `SPECIALIST_TOOL_GATING` in `hire-floor.ts`; `effectiveToolGating` in
  `agent-hire-policy.ts`; `SPECIALIST_REPORT_INSTRUCTIONS`
- `3ee6efbef` an engenty sees its own routines in the runtime block
- `docs/content/dev/work-model.md` gained "Who creates a routine" with the
  mode × situation matrix — the module's `dev/routine-approval.md` links
  it, it does not restate it

Also on that branch, unrelated to this plan: `f3be7089d` (agent_look
schema) and `5763ef0c3` (local service credential — the same patch as
`fix/local-service-credential`, one of the two is redundant once either
lands).

This plan starts from that state. Nothing below is a prerequisite of that
branch, and that branch must not wait for this.

## 3. Target layout

```
modules/engenty-specialists/
  engenty.plugin.json        id engenty-specialists, kind module, category engenty,
                             capabilities { ai: true, ui: false, operations: false },
                             placement none, no env vars, stability experimental
  package.json               @engenty/engenty-specialists — exports ./ai, ./ai/floor
  tsup.config.ts             entry ai/index.ts, ai/floor.ts; .md as text
  tsconfig.json / vitest.config.ts / .npmignore   (copy from copilot)
  AGENTS.md                  module contract notes (builtin, not defineModuleAi, dist gotcha)
  ai/
    index.ts                 node entry — everything below
    floor.ts                 BROWSER-SAFE: LIVE_HIRE_TOOL_IDS, LIVE_HIRE_ATTACHED_TOOL_IDS,
                             LIVE_HIRE_SKILL_IDS, FIRST_ENGENTY_TOOL_IDS,
                             FIRST_ENGENTY_SKILL_ID, FIRST_ENGENTY_TEMPLATE_ID,
                             SPECIALIST_TOOL_GATING, AGENT_ENGENTY_KINDS + resolveAgentEngenty
    policy.ts                withCatalogFloor, withTopLevelHireTools, withTopLevelHireSkills,
                             withLiveHirePresentationTools, withLiveHireSkills,
                             preferredSkillIdsForRun, agentCarriesCatalogFloor,
                             isLiveHireEligible, effectiveToolGating  (pure over floor.ts)
    instructions/
      SPECIALIST.md          the appendix (was SPECIALIST_INSTRUCTIONS, incl. "Your routines")
      REPORT.md              the non-top-level hand-over (was SPECIALIST_REPORT_INSTRUCTIONS)
      index.ts               specialistInstructions({ topLevel }) composes both with
                             AGENT_MEMORY_/AGENT_TASKS_INSTRUCTIONS
    skills/
      index.ts               ENGENTY_SPECIALISTS_MANAGED_SKILLS: Record<name, markdown>
      routines/SKILL.md
      durable-work/SKILL.md
      hire-agent/SKILL.md
      space-data/SKILL.md
      space-setup/SKILL.md
      work-routing/SKILL.md
      chief-of-staff/SKILL.md
    hire/
      hire-welcome-text.ts   (pure; hire-welcome.ts stays in apps/ai — needs ThreadStore)
  dev/
    README.md                index of the notes below
    routine-approval.md      the mode × situation matrix, self-publish mechanics
    floor-and-gating.md      what is always-on, what rides with which skill, why
    hire-dialog.md           how the wizard maps draft → registry row (from this session)
  locales/                   empty until ui: true
```

Stays where it is (needs apps/ai internals, exactly as the copilot's tools do):
`apps/ai/ai/tools/{routines-tools,routine-self-tools,routine-approval,
agent-look-*,agent-self-revise-tool,agent-status-tool,agent-propose-*,
desk-post-tool,message-agent-tool}.ts`,
`apps/ai/ai/tools/engenty-tools/lib/caller-scope.ts`,
`apps/ai/src/ai/registry/effective-capabilities.ts`, assembly,
session-service, `runtime-instructions.ts` (own-routines block),
`hire-welcome.ts`.

Stays in ai-ui for now: `tool-admin-descriptions.ts` (per-tool admin copy
for the floor verbs) — moves with `ui/` in the later phase.

Stays in apps/ui for now: `components/spaces/SpaceAgentHire*` (they import
`@/lib/spaces-queries`). Candidate for `ui/` in a later phase once the module
turns `ui: true`.

## 4. Phases

### Phase 1 — scaffold (no behaviour change)
0. Branch from `feat/hired-routines` (or from `main` once it has landed).
   Phase 1 touches only new files plus wiring lists, so it merges cleanly
   either way; Phase 2 onwards edits files that branch also edits and
   should start only after it is on `main`.
1. Create the module from the copilot skeleton: manifest, package, tsup,
   tsconfig, vitest, AGENTS.md. `ai/index.ts` empty barrel.
2. Wire it in every place `engenty-copilot` is listed as builtin:
   - `apps/ai/package.json` dependency
   - `apps/ui/vite.config.ts` builtin lists (lines ~44/50) and alias block —
     only `./ai/floor` needs a browser alias
   - `apps/core/src/plugins/module-metadata-guardrails.test.ts`
     (`PLUGIN_FACTORY_ENTRY_MODULES`, `UI_PLUGIN_MODULES` — this module is in
     neither; add to whatever "builtin without factory" list the guardrail
     expects, or extend the guardrail)
   - `apps/core/src/plugins/install-validation.test.ts` fixture if it
     enumerates builtins
   - `scripts/ai-check.mjs` — confirm it picks up `ai/skills/*/SKILL.md`
   - `scripts/engenty-modules-compose` / `publish-open.sh` — decide
     open vs closed (see §6)
3. `pnpm -r build`, typecheck, tests green with an empty module.

### Phase 2 — skills move (seed loop)
1. `git mv packages/ai-skills/ai/skills/spaces/{routines,durable-work,
   hire-agent,space-data,space-setup,work-routing,chief-of-staff}` →
   `modules/engenty-specialists/ai/skills/`.
2. `ai/skills/index.ts` exports `ENGENTY_SPECIALISTS_MANAGED_SKILLS`.
3. `tenant-skills-seed.ts`: add a loop with source `engenty-specialists`
   (the copilot loop is already gone on `feat/hired-routines`; the comment
   there describing library skills as "the Space playbooks the copilot and
   hired engenties share" moves with the skills). `assertUniqueManagedSkillNames`
   guards the move. `modules/engenty-copilot/src/__tests__/ai-exports.test.ts`
   was already adjusted for the removed skill export — check it needs nothing
   further.
4. Delete `packages/ai-skills/ai/skills/spaces/` and its DESCRIPTION.md if
   empty; update `load-library-skills.test.ts`.
5. Seed tests: source assertions `library` → `engenty-specialists`.

### Phase 3 — floor + policy move
1. `ai/floor.ts` ← `packages/ai-core/src/agents/{hire-floor,first-engenty,
   agent-engenty}.ts`. `SPECIALIST_TOOL_GATING` already lives in
   `hire-floor.ts` on `feat/hired-routines`, so it travels with the file.
   Browser-safe: no node imports.
2. `packages/ai-core` keeps re-exporting all of it from `index.ts` and
   `browser.ts` (`export … from "@engenty/engenty-specialists/ai/floor"`)
   so the ~30 import sites (`hire-floor.ts` users, the hire wizard,
   `agent-face.tsx`, `space-agent-hire.ts`) don't move in this phase.
   Check ai-core → module dependency direction is allowed by the workspace
   graph; if ai-core must not depend on a module, invert: module re-exports
   from ai-core and the constants stay physically in ai-core. Decide at the
   start of the phase; either way the DX goal (one place to read) is met by
   the module's `floor.ts` being the documented entry.
3. `ai/policy.ts` ← `apps/ai/ai/tools/agent-hire-policy.ts` (pure part,
   including `effectiveToolGating`; `isLiveHireEligible` too — it is pure).
   `agent-hire-policy.ts` becomes a one-line re-export for a release, then
   its importers are pointed at the module.

### Phase 4 — instructions move
1. `ai/instructions/SPECIALIST.md` ← body of `SPECIALIST_INSTRUCTIONS`;
   `REPORT.md` ← `SPECIALIST_REPORT_INSTRUCTIONS`. Keep
   `${AGENT_MEMORY_INSTRUCTIONS}` / `${AGENT_TASKS_INSTRUCTIONS}` as
   composition in `index.ts`, not in the markdown.
2. `assemble-dynamic-agent.ts` imports `specialistInstructions({ topLevel })`
   from the module — today it pushes the two constants itself, with the
   `!extras?.topLevel` branch inline; that decision moves into the module.
3. `.md` loader: tsup `".md": "text"` — copy the copilot's config; add the
   `copy-*-prompts` step only if apps/core ever needs the file on disk
   (it does not read this one — skip unless proven).

### Phase 5 — docs
1. `dev/` notes as listed in §3. `routine-approval.md` links the matrix in
   `docs/content/dev/work-model.md` and adds only what a maintainer of the
   tool needs (self-publish mechanics, `ask_first`, the cannot-park cases).
   `hire-dialog.md` is the writeup from this session (wizard, engenty
   picker, floor, template tools).
2. `docs/wip/README.md` entry; this file graduates to the module's `dev/`.
3. Module `AGENTS.md`: builtin contract, dist-vs-source gotcha, "skills are
   seeded by name — never mount-gated", where the tools live and why.

### Later (not this plan)
- `ui: true`: hire wizard, `agent-face`, roster row, desk pieces move into
  `ui/`. Needs `spaces-queries` to be reachable from a module first.
- `hire-welcome.ts` once ThreadStore access is available to modules.

## 5. Order and independence

Phases 1 → 2 → 5 can ship on their own (skills + docs) — that alone gives
the "one directory" DX for prompts. Phases 3 and 4 touch import graphs and
should each be one PR with a green `pnpm -r typecheck && pnpm -r test`.
Nothing here changes a prompt byte, a tool schema, or a seed name; a diff of
the seeded skill catalog before/after must be empty except for `source`.

## 6. Open decisions (decide at Phase 1 start)

- **Public mirror**: closed like `engenty-remote` (CLOSED_PREFIXES via the
  compose script) or open like the copilot? Default: same as copilot.
- **Dependency direction** for Phase 3 (ai-core → module, or module → ai-core
  with re-export). Default: ai-core stays the physical home of the
  browser-safe constants; the module re-exports. Reverse only if the
  workspace graph already allows ai-core to import a module.
- **Name of the seed source**: `engenty-specialists` (matches module id).

## 7. Done when

- `modules/engenty-specialists/` exists with skills, floor entry, policy,
  appendix, dev notes; `packages/ai-skills/ai/skills/spaces/` is gone.
- `grep -rn "spaces/chief-of-staff\|ENGENTY_COPILOT_MANAGED_SKILLS"` is empty.
- Seeded skill catalog identical except `source`.
- Copilot module holds only surface code: frontend tools, its own
  AGENTS/SOUL, UI.
