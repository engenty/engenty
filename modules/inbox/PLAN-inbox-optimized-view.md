# Inbox — optimized thread view

Status: **phases 1–4 done** on `feat/mdl-inbox-pro`, worktree
`/Users/m/code/engenty/engenty-pro-inbox` (2026-07-23). Not merged — this may
become a pro feature. Dev server: `preview_start {name: "inbox"}` →
`https://inbox.engenty.localhost` (portless slot 1).

Goal: read a mail thread the way you read a Slack channel — the current status
on top, then each message reduced to what the sender actually said. The
classical mail rendering stays one click away.

## What exists now

**Tabs.** `ThreadDetail` has a control bar with `Optimized` (default) and
`Original`. The choice persists in `localStorage` under
`engenty.inbox.thread_view`. `Original` is the previous card rendering,
unchanged.

**Digest service** (`src/services/thread-digest.ts`). Per message, one
light-model call (`AI_INBOX_DIGEST_MODEL`, default `openai/gpt-5-nano`) that
does three jobs at once:

1. strips the body to its substance — no salutations, sign-offs, signatures,
   disclaimers, footers, quoted history — while *preserving structure*
   (headings, bullets, bold, links). This is a cleanup, not a summary: no
   substance may be dropped.
2. picks which attachments are real content.
3. classifies the message: `conversation | notification | newsletter |
   promotion | spam`.

Then one call per thread for the status summary and the participant/role map.

**Attachment triage** is deterministic first, model second. Small inline images
(`content_id` present, ≤ 32 KB) are signature logos, social icons and tracking
pixels — dropped before the model sees them. Real pasted screenshots are inline
too but 55–250 KB in observed mail, so the size threshold separates them
cleanly. In the test corpus this cut 16 attachments to 2 without losing a real
one.

**Caching.** `module_inbox.message_digests` / `thread_digests`, keyed by
`INBOX_DIGEST_VERSION`. Bumping the constant invalidates lazily — the next open
of a thread regenerates it. Thread summaries also regenerate when the message
count or the last message id changes.

**Categories** are shown as tags today (thread-level chip in the status card,
per-message chip when it is not a plain conversation). Judged by sender intent,
not tone: hand-written cold outreach is `promotion`, not `conversation`. A
thread containing any real conversation message counts as a conversation.

**Attachment lightbox.** Clicking an image opens a dialog with the full-size
image and a download action, instead of dumping a blob URL into a new tab.

## Phase 2 — filtering, chat, and chat-shaped UI (done)

**Category lanes.** `messages.ai_category` carries the classification (NOT
`classification`, which is the older unused triage hint). `list_threads` takes a
`p_category` parameter and matches on the *latest* message's category, so a
promo thread a human replied to moves back into the conversation lane.

Classification is eager and cheap: `inbox_classify_pending` batches 20 messages
per model call on header + subject + snippet only. The sync button chains
batches until nothing is pending, and the empty state of a category lane offers
the same run. Full digests refine the category later and write it back — the
digest saw the whole body, so its verdict wins. `ai_category` stays null until
classified, which keeps unclassified mail visible in "All" instead of vanishing
from every lane.

**Summary rework.** The old prompt produced a mixture of stale recap and vague
generalities. It now briefs on the *latest* message only — a concrete headline
plus open points that are still pending as of that message, with explicit
instructions to leave out anything later messages resolved. Earlier messages are
labelled context-only in the prompt.

**Thread chat.** `inbox_thread_chat` answers questions grounded in the stored
digests (a fraction of the raw bodies) and drafts replies. The composer sits
below the transcript with 2–3 suggested actions generated alongside the summary;
if the model returns none, localized fallback chips keep the affordance
discoverable.

**Chat-shaped UI.** Own replies are right-aligned with the avatar on the right
(matched against the connected accounts' addresses), the briefing is sticky at
the top of its own scroll container, the transcript auto-scrolls to the newest
message on open, and the attachment lightbox is near-fullscreen.

## Phase 3 — page header, and one interaction zone (done)

**Header.** The thread reads like every other detail page: the shared
`DetailPageHeader` with the subject as the title, participants and last activity
underneath, the latest message's status as the right-aligned state, and line
tabs (`TabsList variant="line"`, as in contacts/team) flush to the bottom edge.
Opposite the tabs sits the navigation chrome the list page owns: a toggle that
collapses the message list (persisted, and only honoured while a thread is open
so it cannot leave an empty screen), and prev/next with the thread's position in
the current lane. Stepping off either end of a page pulls the neighbouring page
and lands on the thread next to the boundary; while searching, prev/next walks
the search hits instead.

**Summaries are asked for, not produced.** `inbox_thread_digest_get` takes
`include_summary` (default false), so opening a thread costs message digests
only. The result carries `category` derived from those digests, so the thread's
category chip survives without a summary. `useThreadSummaryMutation` re-fetches
with the flag set and writes into the same cache entry.

**One interaction zone.** The status briefing moved off the top and into a zone
pinned below the transcript, together with the next actions — the summary is an
answer, and answers belong where the conversation happens. The module's own
composer is gone: action chips prefill the global copilot composer
(`setCopilotComposerDraft` + `openCopilotShell`, see `useAskCopilot`) with the
action plus a line naming the open thread. `inbox_thread_chat` stays as an
operation for the copilot to call; the UI no longer has a client for it.

## Phase 4 — the split-view shell (done)

The page settles into **two levels, not three**. An intermediate action-bar row
was tried first and cut: with the shell topbar above it and the tab strip below,
the pane grew three stacked bars of chrome.

**Level 1 — the shell topbar**, always present, default (solid) chrome, exactly
as on every other screen. It carries the thread's entity actions through
`usePageConfig({ actions })`. Those actions are also what keeps the bar from
collapsing when the module nav is pinned: `suppressEmptyTopbar` only fires when
breadcrumbs *and* actions are both empty.

**Level 2 — the split.** List pane with its search toolbar; detail pane with
`DetailPageHeader`. Everything scoped to the detail pane lives on the tab strip:
the list toggle at the far left, then the section tabs, and on the right the
position with prev/next plus any view-scoped action.

**The toggle is a burger**, not a panel-open glyph — it stands for the message
list it reveals. Desktop only; on mobile there is no second pane, so the thread
gets its own back row instead.

**Category is header state.** It sits next to the status badge as a tag. The
header reads the digest with `useInboxThreadDigestQuery(id, false)` — enabled
false, so the Email tab never triggers generation while a cached category
still shows.

**Tabs: Email first, then Conversation.** The mail is what a thread is, so it
leads and is the default view. The Conversation tab only appears when the thread
is one — a receipt or a CI notification has nobody to converse with. The
category resolves from the digest when one exists (it saw the whole body), else
from the eager classifier's `ai_category` on the latest message, which rides
along on the thread detail and so costs no extra request. Unclassified keeps the
tab rather than losing the view until classification catches up, and a stored
`optimized` preference falls back to the mail view where no tab exists.

**The tab strip takes view-scoped actions.** `DetailPageHeader`'s `belowStrip`
carries a `tabActions` slot; regenerating the digest moved there from the
interaction zone, since it acts on the selected view rather than on the
conversation. The mutation is owned by `ThreadDetail` and passed to the
optimized view, so the button and the view's loading state stay in step.

## Phase 5 — candidates

- Classification on `inbox.message.synced` instead of the sync button, so lanes
  are complete without a user action.
- Digest generation on sync rather than on open, so the first open is instant.
- Actually *sending* a drafted reply (today the draft is text to copy).
- Feed the digests to the copilot instead of raw bodies — they are far cheaper
  and already stripped.
- Per-tenant category overrides ("this sender is never promotion").
- Hide `spam`/`promotion` from the default "All" lane once categories are
  complete enough to trust.
- Lift the split-view shell into `ui-core` (list slot + action-bar slots +
  `DetailPageHeader`) so contacts and team detail pages can adopt the same top
  edge. The inbox is the first consumer; nothing is shared yet.
- Keyboard nav (j/k for prev/next, e to archive) with the shortcuts shown in
  the action bar's tooltips.
- Make the position a control: click "12 / 468" for a jump popover.

## Gotchas

- **Two zod instances.** Operation schemas use `@hono/zod-openapi`'s `z`; the
  digest service uses plain `zod` for `Output.object`. Mixing them breaks the AI
  SDK's JSON-Schema conversion, so `INBOX_MESSAGE_CATEGORIES` is a plain const
  and each side builds its own enum from it.
- **Bullets lose their text.** Outlook wraps every `<li>` in a `<p>`; a naive
  tag-by-tag conversion splits the marker from its content, and the model then
  faithfully reproduces empty bullets. `htmlToPromptMarkdown` converts list
  items as pairs, and `normalizeDigestMarkdown` repairs both the model's input
  and its output.
- Streamdown ships no prose styles. `DIGEST_PROSE_CLASSES` in
  `thread-optimized-view.tsx` is what makes headings and lists visible.
- **The optimized view owns its scroll container** (a plain `overflow-y-auto`,
  not the shared `ScrollArea`): it needs a real viewport ref for the sticky
  briefing, the scroll-to-newest on open, and the pinned composer. The original
  view still uses `ScrollArea`.
- Migrations that change `list_threads` must `drop function` first — the
  signature changed (8 args now), and `create or replace` cannot change it.
- Models return an empty `suggested_actions` list when unsure even with a
  `.min(2)` schema, so the UI falls back to generic chips rather than trusting
  the constraint.
- **The composer prefill bridge needed wiring.** `setCopilotComposerDraft` has
  always been exported, but only the full-page chat panel called
  `registerCopilotComposerDraftSetter` — from any module route it silently
  returned `false`. The drawer layer (`apps/ui/src/components/
  copilot-drawer-layer.tsx`) now registers the same setter; the two surfaces are
  never mounted together, and latest registration wins.
- `DetailPageHeader`'s default `blended` variant carries `pt-14` — clearance for
  a topbar floating *over* the page (`topbarOverlap`). The inbox does not
  overlap: the topbar sits above in normal flow, so the header overrides that
  padding back to `pt-3` via `containerClassName`. Re-enable `topbarOverlap` and
  the clearance has to come back with it, in both panes.
- **Suppressing the topbar is a conjunction, not a flag.** `AppTopbar`'s
  `suppressEmptyTopbar` needs all of: no `topbarOverlap`, secondary nav open,
  a `secondaryNavHeaderSlot`, no breadcrumbs, no `actions`, no workspace nav,
  and the dock not auto-hidden. The inbox deliberately fails it by passing page
  actions, which is what keeps the topbar present with the nav pinned.
- **Three bars is one too many.** Shell topbar + module action bar + tab strip
  read as stacked navigation. Anything pane-scoped goes on the tab strip;
  anything entity-scoped goes in the topbar. There is no room for a third row.
- **A fresh worktree needs three steps, not one.** `pnpm install`, then
  `turbo run build --filter=./packages/* --filter=./modules/**`, then
  `pnpm --filter @engenty/ui generate:plugins`. The launch.json entries call
  `scripts/dev-portless.sh` directly, which skips the `predev:portless` hook
  that would do the first two; the generated tailwind-sources CSS is gitignored,
  so vite fails on `./plugins/generated-tailwind-sources.css` until the third
  runs. Each worktree is also its own origin, so its browser session is
  separate — a fresh worktree always starts logged out.
