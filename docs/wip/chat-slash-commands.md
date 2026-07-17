# Chat Slash Commands & @-Mentions

Status: **REVIEWED — open questions decided 2026-07-17 (§7), ready to implement** (branch `feat/chat-slash-commands`)
Companion doc: `docs/wip/chat-object-rendering.md` (branch `feat/chat-object-widgets`) — defines the
`ObjectRef` identity scheme and the object-widget rendering this design's @-mentions feed into.

## 1. Goal

Give the agent chat composer two first-class input affordances:

1. **Slash commands** — `/command` typed at the start of the message opens a typeahead menu of
   commands. Commands are contributed by modules through the plugin system (plus a set of core
   built-ins), can take arguments, and either (a) expand into a prompt, (b) invoke a module
   action/tool, or (c) perform a pure client-side UI action.
2. **@-mentions** — `@` opens a typed picker over **agents, users, contacts, objects
   (offers/invoices/tasks/projects/…), artifacts, and files**. A pick inserts a readable token in
   the text and attaches a structured reference (`ObjectRef`) to the message, which the server
   resolves (with authz) into agent context.

Non-goals (this phase): rich-text composer (we stay on the plain textarea), widget-level editing,
user-authored saved-prompt library (sketched as a later phase), Outlook-style org-wide people
search beyond the tenant.

## 2. What exists today (seams we build on)

| Seam | Where | Reuse |
| --- | --- | --- |
| Composer | `packages/ai-ui/src/components/copilot/composer/copilot-composer-section.tsx` — plain `<textarea>` via `PromptInputTextarea`; draft state lifted; submit → `submitMessage(text, { attachments, requestedAgentId })` | Host for both menus; resolution happens in `handleSubmit` |
| Agent @-mention | `use-copilot-composer-mention.ts` + `copilot-agent-mention.ts` (token parse) + `copilot-composer-mention-popover.tsx` (cmdk) + `textarea-caret-viewport-rect.ts` (floating-ui anchor) | The slash menu clones this stack; the mention stack itself is generalized from single-namespace (agents) to multi-type |
| Attachment metadata trick | `packages/ai-ui/src/lib/chat-attachment-part.ts` — rides AG-UI-native content parts, durable info under `metadata.engenty_attachment`, so `RunAgentInputSchema.safeParse` passes untouched | Same trick carries command + refs metadata on the user turn |
| Referenced-sources scaffold | `prompt-input-local-context.tsx` (`ReferencedSourcesContext`, `SourceDocumentUIPart`) — wired, not surfaced | Becomes the mention-chip row under the composer |
| Plugin contribution pattern | `UiTabContribution` end-to-end: SDK type (`packages/ui-plugin-sdk/src/index.ts`) → `EngentyUiApi.registerTab` (`apps/ui/src/plugins/engenty-ui-api.ts:221`) → resolver `normalizeTabs` (`apps/ui/src/plugins/resolver.ts:472`) → `useSurfaceTabs(surface)` | `registerChatCommand` copies this shape verbatim |
| Module AI registration | `defineModuleAi` (`packages/ai-core/src/define-module-ai.ts`) scans `ai/{agents,skills,actions,routines}` + `tools` map; global registry `packages/ai-core/src/registry.ts` | Gains a `commands/` scan → server-side command catalog |
| Server interception seam | `apps/ai/src/api/agent-session-runs-routes.ts:547` — `let hsPrompt = latestUserText(body.data)` … `startConversationRun({ prompt: hsPrompt })` (line ~658); `scope` (tenant/user/token) + `body.data.context` in scope | Command expansion + ref resolution happen exactly here |
| Search for the picker | `workspace_search` (`packages/retrieval`, per-source `fastPath` lexical + trigram), `POST /ai/v1/search-index/providers/:id/search`, `GET /api/users` (tenant users), agent catalog (in-memory), artifact routes | Backs the async @-picker sections |
| ObjectRef scheme | `chat-object-rendering.md` §2: `<module>:<entity>:<id>`, `artifact:<id>`, `core:user:<id>` | Mentions emit exactly these strings; backfills reserved `entity_refs` (`packages/retrieval/src/contracts.ts:61`) |
| Editor slash menu | `packages/tiptap-editor/src/extensions/slash-commands.ts` | Visual reference only (different editor model — we don't reuse code) |

Also relevant: the ⌘K palette (`packages/app-shell/src/components/app-topbar.tsx`) is hardcoded
today; chat commands should *later* be exposable there, but that is explicitly a stretch phase.

## 3. Command model

```ts
// packages/ui-plugin-sdk (client) + packages/ai-core (server) — shared shape
interface ChatCommandContribution {
  id: string;                     // unique within plugin, kebab-case
  pluginId: string;               // stamped by the registrar
  command: string;                // what the user types: "summarize", "create-offer"
  kind: "prompt" | "action" | "ui";
  labelKey?: string;              // i18n, e.g. "offers:commands.createOffer"
  descriptionKey?: string;
  icon?: string;                  // lucide icon name (consistent with other contributions)
  order?: number;
  surface?: "chat";               // reserved; default "chat"
  agentIds?: string[];            // optional: only offered for these agents
  args?: ChatCommandArg[];        // declared arguments (see below)

  // kind-specific payload:
  template?: string;              // kind=prompt — text with {argName} + {input} placeholders
  actionId?: string;              // kind=action — module AI action or strict snake_case tool id
  frontendTool?: string;          // kind=ui — dispatched via the frontend-tool registry
}

interface ChatCommandArg {
  name: string;                   // "contact", "language"
  type: "string" | "enum" | "ref";
  required?: boolean;
  labelKey?: string;
  options?: string[];             // type=enum
  refEntity?: string;             // type=ref — "contacts:contact", "offers:offer", "core:user", "artifact"
}
```

### 3.1 The three kinds

| Kind | Runs | Example | Mechanics |
| --- | --- | --- | --- |
| `ui` | Client only; **no message is sent** | `/clear`, `/agent`, `/model`, `/help` | Dispatched through the existing frontend-tool registry (`agent-ui-state-context.tsx`) or a built-in handler in the composer |
| `prompt` | Server expands, then normal agent run | `/summarize`, `/translate de`, `/daily-briefing` | The visible user message stays `/summarize …` (transcript shows a command chip); the server seam replaces the prompt handed to the model with the expanded template |
| `action` | Server directs the agent at a module action/tool | `/create-offer @Acme`, `/log-time 2h` | v1: expands to a strong directive prompt naming the action + structured args ("Execute the offers `create_offer` action with …"). v2 (later): forced tool-choice on the run |

Design choice: **the raw `/command args` text is what gets persisted as the user turn.** Expansion
is a server-side, run-time concern. This keeps transcripts readable ("what did the user do"),
keeps templates editable without rewriting history, and matches how `requestedAgentId` already
works (per-send option, not persisted content mutation).

### 3.2 Registration — two sources, one catalog

**(a) Module UI contributions** (client): `engenty.UI.registerChatCommand(contribution)` in
`modules/<name>/ui/plugin.ts`. Mirrors `registerTab` exactly: SDK interface + `chatCommands: []`
in `UiContributions`/`EMPTY_CONTRIBUTIONS`, `ui.chatCommands` hook event, `registerChatCommand`
in `engenty-ui-api.ts` (stamps `pluginId`, `sourceInfo` kind `"ui.chatCommand"`), a
`normalizeChatCommands` resolver branch (dedupe by `command`, order-sort, drop invalid), and a
`useChatCommands(surface)` host hook. Install-gating is automatic — parked module ⇒ no command.
This source is authoritative for **`ui` commands** and provides the *client metadata*
(label/icon/args) for all kinds.

**(b) Module AI registrations** (server): `defineModuleAi` gains a conventional
`ai/commands/<command>/COMMAND.md` scan (frontmatter: `command`, `kind`, `args`, `agentIds`;
body: the prompt template — same authoring feel as `ACTION.md`/`SKILL.md`). Registered into the
existing ai-core registry; the **server owns templates and expansion** for `prompt`/`action`
kinds. New endpoint:

```
GET /ai/v1/chat-commands            → catalog for the caller (tenant + enabled modules + agent filter)
```

The composer merges (a) UI-kind client commands with (b) the fetched server catalog. A
`prompt`/`action` command *may* ship only server-side (label/description come from the catalog
response, i18n key resolved client-side via the module namespace); the UI contribution is then
optional garnish (icon, richer arg labels). Collisions: exact `command` string is unique per
catalog; resolver dedupes deterministically (core built-ins win, then plugin order) with a
diagnostics warning — no silent shadowing.

### 3.3 Built-in core commands (v1 set)

| Command | Kind | Effect |
| --- | --- | --- |
| `/help` | ui | Opens the command menu in "browse all" mode with descriptions |
| `/agent <name>` | ui | Same as leading `@agent` — sets `requestedAgentId` (alias for discoverability) |
| `/clear` (or `/new`) | ui | Starts a new thread (existing new-thread action) |
| `/summarize` | prompt | "Summarize this conversation so far …" (core copilot module) |

Module examples to ship with phase 2 as proof: `offers: /create-offer <ref:contact>`,
`time-tracking (pro): /log-time <string>`, `knowledge-base: /kb <string>` (search + answer).

## 4. @-mentions — from single-namespace to typed references

### 4.1 Behavior

- `@` at a word boundary opens the picker. Sections (in order): **Agents**, **People**,
  **Contacts**, **Objects** (offers/invoices/tasks/projects — whatever registers a retrieval
  source), **Artifacts** (this thread first), **Files**. Section filtering by continued typing;
  explicit type narrowing via `@offer:` prefixes is a later nicety, not v1.
- Picking an **agent** keeps today's exact semantics (leading mention ⇒ `requestedAgentId`).
- Picking anything else inserts `@«Label»` into the text **and** adds a reference chip below the
  composer (the surfaced `ReferencedSources` row). Chips are removable; removing the chip removes
  the ref (the text token stays as plain text — text is never authoritative).
- Data sources: agents = in-memory catalog (as today); people = `GET /api/users`; contacts/objects
  = `workspace_search` restricted to targeted sources with the lexical `fastPath` (debounced
  ~150 ms, as-you-type); artifacts = thread artifact list + artifact routes; files = files module
  search source.

### 4.2 Data model

References ride the same metadata trick as attachments — an AG-UI-schema-safe part on the user
turn:

```ts
interface ChatReferencePart {
  type: "text";                    // AG-UI-native, invisible: empty text part
  text: "";
  metadata: {
    engenty_refs: Array<{
      ref: string;                 // ObjectRef: "contacts:contact:<id>" | "core:user:<id>" | "artifact:<id>"
      label: string;               // display label at mention time
      entity: string;              // "contacts:contact" — for chip rendering without resolution
    }>;
  };
}
```

(Carrier decided in §7/Q1: content-part metadata — on the existing text part if the schema
allows, else one invisible carrier part. The constraint set — passes `RunAgentInputSchema`
untouched, survives Mastra persistence, recoverable for transcript rendering — is the same one
the attachment part already solved; the phase-2 spike validates it for this metadata, mirroring
G2 of the object-rendering doc.)

### 4.3 Server resolution (the same seam as commands)

At the `hsPrompt` seam, before `startConversationRun`:

1. Collect `engenty_refs` from the current user turn.
2. For each ref, authorize + resolve **as the run's principal** via the module's `<module>_get`
   gateway op (the same snapshot path `show_objects` uses). Failure ⇒ the ref contributes an
   explicit "(user referenced <label>, but it could not be resolved / you lack access)" note —
   never silent, never leaking data.
3. Inject a compact context block (title, entity, key fields, canonical link) — appended to the
   prompt or, preferably, added to `body.data.context` so it lands in
   `buildAgentUiContextInstructions`' structured context rather than polluting the user text.

Rendering: user-turn chips reuse the object-rendering link-chip mechanics (`useDisplay` per
registered object widget; generic fallback card when the module isn't loaded — G3).

### 4.4 Alignment with chat-object-rendering

- Identity: mentions **emit ObjectRefs**, nothing new.
- Display: mention chips = the same entity chips as assistant-side link upgrades.
- Authz: G1 rules apply verbatim (client-side chip resolution as the viewing user; snapshots carry
  only title/subtitle).
- Sequencing: the @-mention chip rendering + `ObjectRef` utilities come from the object-widgets
  work — which **merged to main as `c403aae` on 2026-07-17**, after this worktree was cut
  (v0.1.26). Rebase this branch onto latest main before implementation; with that, phase 3b has
  no external dependency left.

## 5. UI design (mockups in the review presentation)

1. **Slash menu** — cmdk popover anchored at the caret (`textarea-caret-viewport-rect.ts` +
   floating-ui, exactly like the mention popover). Opens on `/` as the **first character of the
   message** (v1 scope: message-leading only; mid-text `/` never triggers). Groups: *Core*, then
   one group per contributing module (module display name). Rows: icon, `/command`, description,
   source badge for module commands. Keyboard: ↑/↓/Enter/Esc/Tab-complete, same handler shape as
   the mention hook.
2. **Argument hints** — after a command with declared args is selected, a slim hint bar renders
   under the textarea showing arg chips (`<contact>` `<language?>`); a `ref`-typed arg
   auto-opens the @-picker filtered to `refEntity`. No inline ghost text in the textarea (plain
   textarea can't do it cleanly) — the hint bar is the affordance.
3. **@-picker** — the existing mention popover generalized: sectioned results, async sections show
   inline skeleton rows, avatar/icon per type, secondary line (email / offer number / modified
   date). Empty query shows agents + recent items.
4. **Reference chips row** — between textarea and the attachment row: removable chips
   (icon + label), overflow "+N".
5. **Transcript** — a sent command renders as a chip (`⌘ /summarize`) followed by any free text;
   mentioned refs render as entity chips in the user bubble.
6. **`/help`** — reopens the menu in browse mode with full descriptions (no modal).

## 6. Phases

**Phase 1 — Slash-command core (client) + built-ins.**
Slash token parser (`copilot-slash-command.ts`, mirroring `copilot-agent-mention.ts`) +
`use-copilot-composer-slash.ts` + menu popover; `ui`-kind execution path; built-ins
`/help`, `/clear`, `/agent`; command chip in transcript for sent commands. Static in-package
command list; no plugin API yet. *Open-base code (`packages/ai-ui`).*

**Phase 2 — Plugin registry + server expansion.**
`registerChatCommand` end-to-end (SDK → api → resolver → `useChatCommands`); `COMMAND.md` scan in
`defineModuleAi` + registry + `GET /ai/v1/chat-commands`; `engenty_command` metadata on the user
turn; expansion of `prompt`/`action` kinds at the `hsPrompt` seam; i18n keys; 2–3 real module
commands (offers, kb, time-tracking-pro). *Split carefully: `ui-plugin-sdk`/`apps/ui`/`ai-ui`
changes are open-base; time-tracking command is pro-only.*

**Phase 3 — Typed @-mentions.**
3a: multi-section picker + async search wiring + `engenty_refs` metadata + chips row + server-side
resolution at the seam (plain-text context block).
3b: chips upgrade to object widgets; refs backfill `entity_refs`; `ref`-typed command args
integrate the picker. (Object widgets merged to main `c403aae` 2026-07-17 — unblocked once this
branch rebases onto latest main.)

**Phase 4 — Polish / stretch.**
Saved prompts (user/tenant command store — reuse the instruction-override persistence pattern),
⌘K exposure of chat commands, `@type:` narrowing, forced tool-choice for `action` kind, argument
validation UX, mobile audit.

## 7. Decisions (review 2026-07-17, Matthias)

- **Q1 Carrier for command/refs metadata → content-part metadata** (the proven attachment trick).
  Attach `metadata.engenty_command` / `metadata.engenty_refs` to the user turn's existing text
  part if the AG-UI schema allows `metadata` on text parts (attachment parts already carry it);
  else fall back to one invisible empty carrier part, stripped at the server seam before prompt
  assembly. Rejected: message-level `metadata` — zod strips unknown keys unless the shared
  ag-ui-bridge schema is extended, and Mastra round-tripping of top-level custom fields is
  unproven, all for no functional gain. The phase-2 spike validates part-metadata survival across
  reload/thread-move (mirrors G2) rather than choosing a carrier.
- **Q2 Localized aliases → decided:** command strings stay canonical ASCII/English; localized
  labels participate in the typeahead filter only (widget-side), never as the persisted token.
- **Q3 `action` v1 fidelity → decided:** directive-prompt expansion for v1; forced tool-choice
  stays a phase-4 stretch.
- **Q4 Availability filtering → decided:** filter by `agentIds` **and** hide action commands whose
  tool the current agent lacks (resolved `toolIds`).
- **Q5 Open-base/pro split → confirmed:** phases 1–3 land in open-base repos; PRs route to public
  `engenty/engenty` per the tab-contributions precedent.
