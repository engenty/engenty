# PLAN — Offers AI face refresh (`modules/offers/ai/*`)

> Status: **done** (2026-07-22). Audit of the existing AI face for
> up-to-dateness and completeness, with exact fixes. Self-contained — no prior
> conversation needed. Paths relative to the repo root (`engenty-pro`).

## Audit result (verified 2026-07-22)

The offers AI face is structurally current: `defineModuleAi` registrar wired via
`server.registerAiRegistration(offersAiRegistration())` in [src/plugin.ts](src/plugin.ts),
`agents/offers.manager/` (agent.json + AGENTS.md), a code-level agent definition
([ai/offers-manager.ts](ai/offers-manager.ts)), 3 skills, and a `/create-offer`
chat command. Skill coverage of the 12 registered operations is complete
(`offers_delete` is deliberately documented only as a warned-about action).

But it has one real staleness bug and two completeness gaps:

### Finding 1 — STALE status value `"done"` (bug, agents will send invalid filters)

The status enum is `draft | ready | accepted`
([src/schema/zod.ts:3](src/schema/zod.ts) — `offerStatusSchema`). Two AI files
still document the pre-rename value `done`:

- [ai/skills/offers-search-and-retrieve/SKILL.md](ai/skills/offers-search-and-retrieve/SKILL.md):
  - "`status` — filter by `\"draft\"`, `\"done\"`, or `\"accepted\"`" → an agent
    sending `status: "done"` to `offers_list` fails zod validation.
  - "Use status labels: `draft` = Draft, `done` = Ready, `accepted` = Accepted."
- [ai/agents/offers.manager/AGENTS.md](ai/agents/offers.manager/AGENTS.md):
  - "Status labels: draft = Draft (editable), done = Ready (finalized), accepted = Accepted."

The code prompt in [ai/offers-manager.ts](ai/offers-manager.ts) already says
`ready` correctly — AGENTS.md is an outdated copy of those lines. Fix both files
by replacing `done` with `ready` (three occurrences total; afterwards
`grep -rn '"done"\|done = Ready' modules/offers/ai/` must return nothing).

### Finding 2 — `offers_list` `client_id` filter undocumented

`offersListQuerySchema` ([src/schema/zod.ts](src/schema/zod.ts) ~line 141) accepts
`client_id: z.string().optional()`, but the search skill's parameter list omits
it. Add to the "Listing Offers" bullet list in
[ai/skills/offers-search-and-retrieve/SKILL.md](ai/skills/offers-search-and-retrieve/SKILL.md):

```markdown
- `client_id` — filter to offers linked to one contact (use the contact's UUID)
```

### Finding 3 — `billing_plan` undocumented

The offer entity and `offers_update` patch carry `billing_plan`
([src/schema/zod.ts](src/schema/zod.ts): `offerBillingPlanSchema` — `mode:
"full_on_delivery" | "deposit_balance" | "milestones"` plus a `milestones` array
of `{ description, date | null, percent }`). No skill mentions it, so agents
cannot help with payment plans. Add to the "Editing an Offer" section of
[ai/skills/offers-create-and-edit/SKILL.md](ai/skills/offers-create-and-edit/SKILL.md)
(after the patchable-fields paragraph):

```markdown
## Payment Plan (billing_plan)

Fixed-price offers can carry a payment plan in `billing_plan` (patch it via
`offers_update` like any other field, or set it to `null` to remove it):

- `mode`: `"full_on_delivery"` (single payment), `"deposit_balance"` (deposit
  now, rest on delivery), or `"milestones"` (custom schedule).
- `milestones`: array of `{ "description": string, "date": ISO date or null,
  "percent": number }`. The percents should sum to 100 — check before writing
  and warn the user when they do not.

Example patch: `{ "id": "<offer-id>", "patch": { "billing_plan": { "mode":
"milestones", "milestones": [ { "description": "Kickoff", "date": null,
"percent": 30 }, { "description": "Go-live", "date": null, "percent": 70 } ] } } }`
```

## Non-findings (checked, fine as-is)

- Blocks skill is accurate and current: canonical `content_json` field names
  (`amount`/`cost_per_item`/`tax`), phase-as-`headline`+`is_phase`, the
  `offers_update_blocks` diff-write vs `offers_replace_blocks` full replacement,
  realtime/conflict-banner behavior, act-directly-on-drafts guidance.
- `offers_list` paging/sort params in the skill match the schema
  (`page`/`pageSize` max 200/`sortBy` enum/`sortOrder`/`search`).
- Billing types/intervals in the create skill match the enums.
- [ai/commands/create-offer/COMMAND.md](ai/commands/create-offer/COMMAND.md) is
  valid (`kind: workflow` + `workflow_id` expands to a prose instruction; the
  `offers-create-and-edit` target is the skill the agent should follow).
- `invoke_frontend_tool` in agent.json + `navigate` in the create skill's
  allowed-tools work via the copilot base frontend tools; the module registers
  no own frontend tools — acceptable (manifest `frontendTools: true` simply
  permits future ones).

## Optional (only if in scope)

- Copilot starter prompts: offers UI registers no `registerCopilotContribution`
  (pattern: [../projects/ui/copilot-contribution.ts](../projects/ui/copilot-contribution.ts)).
  Prompts like "Draft an offer for <client>", "Add a phase with 3 positions",
  "Mark this offer ready" would make the AI face discoverable. UI change, not
  `ai/*` — separate decision.

## Verification

1. `grep -rn "done" modules/offers/ai/` → no status-value hits (only prose like
   "delivery" words, if any).
2. `pnpm --filter @engenty/module-offers test` (confirm the package name in
   [package.json](package.json)) — skills are markdown, but the registrar test
   must still pass.
3. Manual smoke: in chat ask "list my ready offers" → the agent must call
   `offers_list` with `status: "ready"` (not `done`); ask "set up a payment plan
   with 30/70 milestones" → agent patches `billing_plan`.

## Gotchas

- Skill `name:` frontmatter must stay equal to the folder name — do not rename
  skills while editing.
- AGENTS.md is loaded as agent instructions by the scanned config; the code
  prompt in `offers-manager.ts` is built separately for the code-level
  definition. Statements duplicated in both must be fixed in both (the `done`
  bug exists only in AGENTS.md; keep them consistent going forward).
- Repo pushes direct to main; run the module tests before pushing.
