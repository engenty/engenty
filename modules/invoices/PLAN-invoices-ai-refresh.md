# PLAN — Invoices AI face refresh (`modules/invoices/ai/*`)

> Status: **done** (2026-07-22). Audit of the existing AI face for
> up-to-dateness and completeness, with exact fixes. Self-contained — no prior
> conversation needed. Paths relative to the repo root (`engenty-pro`).

## Audit result (verified 2026-07-22)

The invoices AI face is structurally current: `defineModuleAi` registrar wired via
`server.registerAiRegistration(invoicesAiRegistration())` in
[src/plugin.ts](src/plugin.ts), `agents/invoices.manager/` (agent.json + AGENTS.md),
a code-level agent definition ([ai/invoices-manager.ts](ai/invoices-manager.ts)),
and 3 skills. Coverage of the 15 registered operations is effectively complete —
14 documented; `invoices_count_by_client_ids` is an internal cross-module count
and intentionally undocumented. The lifecycle content is accurate: statuses
`draft | issued | sent | paid | cancelled` match `invoiceStatusSchema`,
`invoices_set_status` is correctly described as sent/paid only, `invoices_issue`
as the approval gate, `invoices_cancel` as linked Storno, and the blocks skill's
`content_json` field names (`quantity`/`unit_price`/`tax_rate`) match the "new"
shape that [src/lib/invoice-commercial.ts](src/lib/invoice-commercial.ts) and
[src/pdf/templateData.ts](src/pdf/templateData.ts) read (legacy
`amount`/`cost_per_item` is auto-detected, so no alias warning is needed).

One real contradiction and two completeness gaps:

### Finding 1 — snake_case rule contradicts the module's actual camelCase inputs (bug)

Invoices is a legacy-shaped module: its operation inputs are **camelCase** —
`invoiceInputSchema` has `dueDate`, `sumNetto`, `sumBrutto`, `clientId`
([src/schema/zod.ts](src/schema/zod.ts) ~line 91), `invoices_get` takes
`idOrNumber`, `invoices_list_by_client` takes `clientId`. The skill tables in
[ai/skills/invoices-create-and-edit/SKILL.md](ai/skills/invoices-create-and-edit/SKILL.md)
and [ai/skills/invoices-search-and-retrieve/SKILL.md](ai/skills/invoices-search-and-retrieve/SKILL.md)
correctly show these camelCase names — but two instructions tell the agent the
opposite:

- [ai/agents/invoices.manager/AGENTS.md](ai/agents/invoices.manager/AGENTS.md),
  Hard rules: "Use snake_case for all API field names."
- [ai/skills/invoices-search-and-retrieve/SKILL.md](ai/skills/invoices-search-and-retrieve/SKILL.md),
  Notes: "Use snake_case field names."

An agent following the rule sends `due_date`/`sum_netto` and fails validation.
Also check [ai/invoices-manager.ts](ai/invoices-manager.ts) for the same
copied line in the built system prompt and fix it there too if present.

Replace both (all) occurrences with this wording:

```markdown
- Invoice operation inputs use camelCase field names (`dueDate`, `sumNetto`,
  `sumBrutto`, `clientId`, `idOrNumber`) — this module predates the snake_case
  convention. Inside block `content_json`, line-item fields are snake_case
  (`quantity`, `unit_price`, `tax_rate`). Follow the field names shown in the
  skill tables exactly; do not convert between cases.
```

### Finding 2 — no `/create-invoice` chat command (parity gap with offers)

Offers ships [../offers/ai/commands/create-offer/COMMAND.md](../offers/ai/commands/create-offer/COMMAND.md);
invoices has no `ai/commands/`. Add `ai/commands/create-invoice/COMMAND.md`
(scanned automatically by `defineModuleAi` — no registrar change):

```markdown
---
command: create-invoice
kind: action
action_id: invoices-create-and-edit
label: Create invoice
description: Draft a new invoice for a contact
args:
  - name: contact
    type: ref
    ref_entity: "contacts:contact"
    required: true
---
```

(`action_id` expands into a prose instruction pointing the agent at the
`invoices-create-and-edit` skill — same soft-reference mechanism the offers
command uses; see `expandChatCommand` in
[../../packages/ai-core/src/chat-commands/contracts.ts](../../packages/ai-core/src/chat-commands/contracts.ts).)

### Finding 3 — assembling-from-hours workflow has no tool path documented

[ai/agents/invoices.manager/AGENTS.md](ai/agents/invoices.manager/AGENTS.md) and
the blocks skill both promise "assemble invoices from tracked hours and material
bookings", but no skill says where those bookings come from. Agents are left to
guess. Add a short section to
[ai/skills/invoices-blocks-management/SKILL.md](ai/skills/invoices-blocks-management/SKILL.md)
under "Assembling from hours & materials":

```markdown
Find the source data through the catalog: `engenty_tools_search` with
`moduleId: "time-tracking"` for tracked hours (and the projects/tasks modules
for scope context). If the time-tracking module is not installed or returns no
operations, say so and ask the user to provide the positions instead of
inventing them.
```

(Before landing, verify the time-tracking module's actual list operation ids via
`grep -rn "operationId" modules/time-tracking/src` and name the concrete op(s)
in the skill — time-tracking is PRO-only, hence the not-installed fallback.)

## Non-findings (checked, fine as-is)

- `invoices_list` really takes `{}` (`z.object({}).passthrough()`) — the skill's
  empty input is correct; there are no server-side filters to document.
- "Overdue is derived, not a stored status" — matches the schema (no such enum
  value).
- The finish-but-don't-send contract, draft-only editability, and
  `requiresApproval` on all writes are consistent with the operations
  (riskLevel high + requiresApproval on create/update/issue/set_status/cancel/
  delete/replace_blocks) and with the durable tool-approval flow (v0.1.66).
- `invoke_frontend_tool` in agent.json is fine even though the manifest has
  `frontendTools: false` — it drives the copilot's base tools (navigate etc.);
  module-owned frontend tools are a separate, currently unused, capability.
- No HEARTBEAT.md/SOUL.md — optional, only contacts uses them.

## Optional (only if in scope)

- Copilot starter prompts (`registerCopilotContribution`, pattern
  [../projects/ui/copilot-contribution.ts](../projects/ui/copilot-contribution.ts)):
  "Assemble an invoice from last month's hours", "Which invoices are overdue?",
  "Issue this invoice" (with the approval gate doing its job). UI change, not
  `ai/*` — separate decision.
- Consider enabling `frontendTools` + an `invoices_apply_draft_patch`-style page
  tool later, mirroring contacts — not needed for correctness now.

## Verification

1. `grep -rn "snake_case" modules/invoices/ai/` → only the new corrected wording
   remains.
2. `pnpm --filter @engenty/module-invoices test` (confirm the package name in
   [package.json](package.json)).
3. Manual smoke: "show invoice <number>" → agent calls `invoices_get` with
   `idOrNumber`; "create a draft invoice for <client>" → `invoices_create` with
   camelCase fields passes validation; `/create-invoice` appears in the chat
   slash-command menu after restart.

## Gotchas

- Skill `name:` frontmatter must stay equal to the folder name.
- AGENTS.md (scanned instructions) and `invoices-manager.ts` (code-built prompt)
  can drift — fix duplicated statements in both.
- Commands are scanned from `ai/commands/*/COMMAND.md` by `defineModuleAi`;
  the slash-command registry may be cached per boot — restart the dev stack
  before checking the menu.
- Repo pushes direct to main; run the module tests before pushing.
