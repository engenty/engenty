# team-chat — Slack-compatible team messaging module

Status: DESIGN — draft 2026-07-17, awaiting review. No implementation yet.
Branch: `feat/team-chat` (worktree `engenty-pro-team-chat`). Prior `feat/channels`
worktree exists but is deliberately **not** used as a basis (see §16 for the one piece
of residue it left behind).

---

## 1. Goals

1. **Slack-like team messaging as a first-class module** (`modules/team-chat`, slug
   `team-chat`, schema `module_team_chat`): channels (public/private), DMs (1:1 and
   group), threads, reactions, emoji, attachments, rich content.
2. **API- and data-model-compatible with Slack** — not to serve Slack clients, but so a
   remote Slack workspace can later be *bound* to team-chat channels with a thin,
   symmetric bridge (§14).
3. **Channels bindable to a project** — the project detail page gains a "Chat" tab, and
   (per channel settings) project activity is streamed into the channel as system
   messages (§10).
4. **Agents are first-class participants** — they can be channel members, be
   @-mentioned, respond in threads with the full agent-run experience, and post
   programmatically. Users and agents can be mentioned and have tasks delegated to
   them from messages (§8, §9).
5. **Thread UI stays close to the agent chat thread** — reusing the ai-ui engine's
   presentational components and, for agent-driven threads, the actual run engine (§7).
6. **Overview page** — a module home with activity stream(s): unreads, mentions, recent
   across the user's conversations (§6.5).

### Non-goals (v1)

- Serving Slack's official clients or implementing Slack RTM/Socket Mode.
- Huddles/calls, workflows/canvas, scheduled messages, ephemeral messages.
- The remote-Slack bridge itself (designed for, not built — §14).
- Federation with the AI copilot thread list (channel threads are not `ai.thread`s;
  they *link* to them, §7.3).

---

## 2. Slack compatibility strategy

The compatibility contract has three layers. Everything else in this doc follows from it.

### 2.1 Data semantics we adopt 1:1

1. **One conversation family.** `public_channel`, `private_channel`, `im` (1:1 DM),
   `mpim` (group DM) are all rows of one `conversations` table, share membership,
   history, read-marks, and one `conversations.*` API — exactly Slack's model.
2. **`ts` is the message identity.** A string `"<epoch-seconds>.<6-digit-counter>"`,
   unique per conversation, lexicographically time-sortable. Threads: replies carry
   `thread_ts` = the parent's `ts`; the parent accumulates `reply_count` /
   `latest_reply`. Edits keep `ts` and set `edited: {user, ts}`. We keep a uuid PK
   internally, but `(conversation_id, ts)` is UNIQUE and is the wire identity.
3. **Message object shape** (stored + wire): `ts`, `thread_ts?`, author (`user_id` |
   `bot_id` | `agent_type_key` — see deviations), `text`, `blocks jsonb`,
   `attachments jsonb` (legacy Slack shape, accept-only), `files jsonb`,
   `subtype?` (`channel_join`, `channel_topic`, `bot_message`, `thread_broadcast`, our
   `activity`), `metadata jsonb` (Slack message-metadata: `{event_type, event_payload}`),
   `edited jsonb`, `reactions` (own table, aggregated on read as
   `[{name, users, count}]`).
4. **Entity encoding in text**: `<@U…>` user mention, `<#C…|name>` channel ref,
   `<!here>`/`<!channel>` broadcast, `<url|label>` links, `:shortcode:` emoji. We store
   these tokens verbatim in `text` and resolve them at render time.
5. **Block Kit subset**: `rich_text` (canonical composer output), `section`, `context`,
   `header`, `divider`, `image`. Unknown block types degrade to `text` fallback.
6. **Message metadata** carries our structured extensions (entity refs to
   tasks/projects/offers, activity event payloads). This is Slack's own official
   mechanism, so even engenty-specific content round-trips through a real Slack.
7. **Read state**: per-member `last_read_ts` + `conversations.mark` semantics; unread
   count = messages with `ts > last_read_ts`.
8. **Pagination**: cursor-based `{limit, cursor}` → `response_metadata.next_cursor`;
   `history(oldest, latest, inclusive)`.
9. **Events**: everything the module emits about itself uses Slack Events-API event
   names and payload shapes (`message`, `message_changed`, `message_deleted`,
   `reaction_added/removed`, `member_joined_channel`, `channel_created`,
   `channel_rename`, `channel_archive`, `app_mention`, `file_shared`) wrapped in the
   platform's module-event envelope (§10.2). A future bridge consumes the same shapes
   it would receive from Slack.

### 2.2 Method-shaped service layer

Operations (the platform's canonical capability-gated unit) are named and shaped after
Slack Web API methods — snake_cased with the module prefix, `{ok: boolean, error?}`
response envelope. Full list in §5. A bridge maps `team_chat_post_message` ↔
`chat.postMessage` field-for-field.

### 2.3 Deliberate deviations (small, documented)

| Deviation | Rationale |
|---|---|
| IDs are engenty-native (uuid / user uuid / `agent_type_key`), not Slack `C…/U…` ids | No id-minting magic; the bridge keeps remote↔local id maps in the `external jsonb` column that exists on conversations and messages for exactly this purpose |
| `text` is GFM markdown + Slack entity tokens, not strict mrkdwn | Our renderer is Streamdown (markdown). mrkdwn↔markdown conversion (`*bold*`↔`**bold**`, etc.) is a small, well-understood transform done at the bridge boundary, not in the hot path |
| Author may be an agent: `agent_type_key` alongside `user_id`/`bot_id` | Slack precedent is `bot_id`+`bot_profile`; agents render as bot-style authors |
| Soft delete (`deleted_at` + tombstone) instead of Slack hard delete | Audit + undo; bridge translates to `chat.delete` |
| Auth = engenty capabilities/session, not Slack tokens/scopes | Platform authz; the op table in §5 notes the conceptual scope each op corresponds to |
| Realtime = Supabase postgres_changes + SSE, not Socket Mode | Platform infra; payloads still use the Events shapes |
| `team_id` = tenant id; no enterprise-grid layer | Tenant == workspace |

---

## 3. Module anatomy (wiring)

Standard workspace-plugin layout, mirroring `modules/inbox` / `modules/tasks`:

```
modules/team-chat/
  package.json                 # @engenty/team-chat; exports ".", "./ui/plugin", "./ai/registrar"
  engenty.plugin.json          # id "team-chat", kind "module"
  src/plugin.ts                # default EngentyPluginFactory
  src/api/                     # registerOperation handlers (§5)
  src/dal/supabase.ts          # tenant/scope-bound repo over module_team_chat
  src/schema/{types,zod}.ts    # Slack-shaped types shared with UI
  src/activity/                # project-activity subscriber (§10)
  ai/registrar.ts + ai/tools/  # agent tools (§9)
  ui/plugin.ts                 # routes, nav, live bindings, tab contribution, i18n
  ui/pages/ ui/components/ ui/hooks/
  ui/locales/{en,de}.json
  supabase/migrations/<ts>_plugin_team-chat.sql
```

Manifest:

```json
{
  "id": "team-chat", "name": "Team Chat", "kind": "module",
  "provides": ["module.team-chat", "module.team-chat.read", "module.team-chat.write",
               "module.team-chat.manage", "ui.route.module.team-chat"],
  "optional": ["module.projects", "module.tasks", "module.team", "module.connections"],
  "capabilities": { "operations": true, "ai": true, "ui": true }
}
```

Wiring checklist (all mechanical, per the established module pipeline):

1. Add `"team-chat": {"source":"workspace"}` to root `package.json → engenty.plugins`.
2. `pnpm engenty setup` — regenerates `apps/ui/src/plugins/generated-catalog.ts`,
   aggregates migrations, exposes `module_team_chat` in `[api].schemas`.
   (Post-merge gotcha: stale catalog → run `pnpm --filter @engenty/ui generate:plugins`.)
3. Role profiles registered by `src/plugin.ts`:
   - `team-chat.member` → `module.team-chat`, `.read`, `.write`
   - `team-chat.manager` → member + `.manage` (create/archive/rename channels, manage members)
   - agents get `.read`/`.write` via their profile so the AI tools work (§9).
4. Open-vs-pro decision (Matthias): if pro-only, add `modules/team-chat` to
   `CLOSED_PREFIXES` in `scripts/publish-open.sh`. Recommendation: **open** — it's a
   core collaboration primitive and a showcase for agent participation; the future
   Slack *bridge* can be the pro part.

---

## 4. Data model — `module_team_chat`

Fresh schema (NOT `module_channels`, see §16). All tables: `tenant_id uuid references
core.tenants(id) on delete cascade`, `scope_id text default 'default'`, RLS enabled.

### 4.1 Tables

**`conversations`**
- `id uuid pk`, `type text check in ('public_channel','private_channel','im','mpim')`
- `name text` (null for im/mpim; unique per tenant among non-archived channels via
  partial unique index on `(tenant_id, lower(name))`)
- `topic text`, `purpose text`, `is_archived bool`, `created_by uuid` (user)
- `member_hash text` — canonical sorted member-set hash, partial unique index for
  `type in ('im','mpim')` per tenant → `conversations.open` is find-or-create
- `project_id uuid null` + `settings jsonb` (`{activity: {enabled, events: [...]},
  default: bool}`) — project binding (§10)
- `external jsonb` — bridge anchor (`{slack: {team_id, channel_id, last_sync_cursor}}`)

**`conversation_members`**
- `conversation_id fk`, `principal_type text check in ('user','agent')`,
  `principal_id text` (user uuid or `agent_type_key`), `role check in ('owner','member')`
- `last_read_ts text`, `muted bool`, `notify_prefs jsonb`
- unique `(conversation_id, principal_type, principal_id)`

**`messages`**
- `id uuid pk`, `conversation_id fk`, **`ts text not null`**, `thread_ts text null`
- author: `user_id uuid null`, `agent_type_key text null`, `bot_id text null`
  (check: at least one author OR a `subtype` for system messages)
- `text text`, `blocks jsonb default '[]'`, `attachments jsonb default '[]'`,
  `files jsonb default '[]'`
- `subtype text null`, `metadata jsonb default '{}'`, `edited jsonb null`
- thread rollup on the parent row: `reply_count int default 0`, `latest_reply text null`,
  `reply_users jsonb default '[]'` — maintained by the repo in the same transaction as
  the reply insert (no trigger; keeps logic in one place)
- `deleted_at timestamptz null` (tombstone: `subtype` stays, `text` blanked on read)
- `external jsonb`
- **unique `(conversation_id, ts)`**; indexes: history `(conversation_id, ts desc) where
  thread_ts is null and deleted_at is null`, thread `(conversation_id, thread_ts, ts asc)`,
  GIN `to_tsvector('simple', text)` for lexical search

**`reactions`**
- `conversation_id`, `message_ts`, `emoji text` (shortcode, e.g. `thumbsup`),
  `principal_type/principal_id` (user or agent); unique on the quad; aggregated on read
  into the Slack `reactions` array

**`mentions`** — extraction of `<@…>`/`<!channel>` tokens at post time, for fast
"my mentions" queries + notification fan-out
- `conversation_id`, `message_ts`, `kind check in ('user','agent','here','channel')`,
  `target_id text null`; index `(tenant_id, kind, target_id, created_at desc)`

**`pins`**
- `conversation_id`, `message_ts`, `pinned_by uuid`; unique `(conversation_id, message_ts)`

**`agent_thread_links`** — channel thread ↔ agent run context (§7.3)
- `conversation_id`, `thread_ts`, `ai_thread_id text`, `agent_type_key text`
- unique `(conversation_id, thread_ts, agent_type_key)` — a thread can host several
  agents, each with its own linked `ai.thread`

### 4.2 `ts` generation

Server-side in the repo: `floor(epoch_seconds).%06d` where the suffix is a per-request
counter; uniqueness enforced by the unique index with one retry-on-conflict loop
(bump suffix). Monotonic per conversation is guaranteed by the index + retry, matching
Slack's guarantee (unique + roughly time-ordered), without a sequence per conversation.

### 4.3 Grants, RLS, realtime

Two access paths, following the inbox/tasks precedent exactly:

- **service_role** (core API): full CRUD grants; repos additionally filter
  `tenant_id`/`scope_id` and enforce membership in code.
- **authenticated** (Supabase Realtime subscribers): `grant usage` on schema +
  `grant select` on `conversations`, `messages`, `reactions`, `conversation_members`;
  `replica identity full`; added to `supabase_realtime` publication; RLS SELECT
  policies gating rows to visible conversations:

```sql
create function module_team_chat.is_conversation_visible(conv uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from module_team_chat.conversations c
    where c.id = conv and c.tenant_id = core.current_tenant_id()
      and (c.type = 'public_channel'
           or exists (select 1 from module_team_chat.conversation_members m
                      where m.conversation_id = conv
                        and m.principal_type = 'user'
                        and m.principal_id = auth.uid()::text)));
$$;
```

`security definer` is required — WALRUS evaluates policies as the subscriber, and a
naive membership policy on `messages` referencing `conversation_members` (which itself
has RLS) recurses; this is the exact pattern already proven by
`ai.is_thread_member()` (`20260705150000_ai_thread_participant_rls_recursion.sql`).
**Private channels and DMs never leak through realtime or PostgREST** because every
SELECT policy funnels through this function.

CI guards to satisfy: `check-rls-coverage.mjs`, migration naming
`YYYYMMDDHHMMSS_plugin_team-chat.sql`.

---

## 5. API surface — operations

All registered via `registerOperation` (auditable, capability-gated, auto-exposed to
agents and dispatchable at `POST /api/tools/:operationId/invoke`). Input/output schemas
are the Slack method shapes (zod in `src/schema/zod.ts`). `read` ops: `riskLevel: low`,
idempotent, `module.team-chat.read`. `write` ops: `medium`, `module.team-chat.write`.
`manage` ops: `medium`, `module.team-chat.manage`.

| Operation | Slack method | Group | Notes |
|---|---|---|---|
| `team_chat_conversations_list` | conversations.list | read | `types` filter, cursor pagination, excludes ims of others |
| `team_chat_conversations_info` | conversations.info | read | |
| `team_chat_conversations_create` | conversations.create | manage | `is_private` |
| `team_chat_conversations_open` | conversations.open | write | im/mpim find-or-create via `member_hash` |
| `team_chat_conversations_join` / `_leave` | conversations.join/leave | write | public channels only for join |
| `team_chat_conversations_invite` / `_kick` | conversations.invite/kick | manage | accepts users **and agents** |
| `team_chat_conversations_archive` / `_unarchive` / `_rename` | conversations.* | manage | |
| `team_chat_conversations_set_topic` / `_set_purpose` | conversations.setTopic/Purpose | write | |
| `team_chat_conversations_members` | conversations.members | read | |
| `team_chat_conversations_history` | conversations.history | read | `oldest/latest/inclusive/limit/cursor` |
| `team_chat_conversations_replies` | conversations.replies | read | by `ts` |
| `team_chat_conversations_mark` | conversations.mark | write | sets `last_read_ts` |
| `team_chat_post_message` | chat.postMessage | write | `channel, text, blocks?, thread_ts?, reply_broadcast?, metadata?, files?`; extracts mentions, bumps thread rollup, fires events + notifications |
| `team_chat_update_message` | chat.update | write | author-or-manager only |
| `team_chat_delete_message` | chat.delete | write | soft delete, author-or-manager |
| `team_chat_get_permalink` | chat.getPermalink | read | app URL `/mdl/team-chat/:conversationId?thread=<ts>&msg=<ts>` |
| `team_chat_reactions_add` / `_remove` / `_get` | reactions.* | write/read | |
| `team_chat_pins_add` / `_remove` / `_list` | pins.* | write/read | |
| `team_chat_users_conversations` | users.conversations | read | the caller's conversations (drives sidebar) |
| `team_chat_unreads` | *(engenty extension)* | read | per-conversation unread + mention counts in one call (sidebar badges, overview) |
| `team_chat_search_messages` | search.messages | read | lexical GIN v1; retrieval-source vector path later (§12) |
| `team_chat_bind_project` / `_unbind_project` | *(engenty extension)* | manage | sets `project_id` + activity settings; requires the caller to see the project |

File upload needs no new op: the client uses the existing signed-upload flow
(`POST /api/file-storage/files/signed-upload-url`, storage key
`tenants/<t>/team-chat/<conversationId>/<ts>_<name>`) and passes the resulting
attachment parts in `post_message.files` — same representation as chat attachments
(`metadata.engenty_attachment = {filename, mimeType, size, storageKey}`), so the
transcript attachment renderer works unchanged.

Membership enforcement is in the repo layer for every op (member for read on
private/im/mpim; any tenant user for public channel read; member for post).

---

## 6. UI

Route root `/mdl/team-chat`, app-bar item via `registerAdminMenuItem({section:
"modules", useBadgeCount})` where the badge = unreads+mentions from
`team_chat_unreads`. i18n namespace `team-chat` (en/de). Everything follows
`docs/agent/DESIGN.md` (ui-canvas surfaces, no hand-rolled borders/shadows, paint-only
hover, `--e-*` elevation tokens).

### 6.1 Information architecture

```
/mdl/team-chat                     → Overview (streams: unreads, mentions, recent)
/mdl/team-chat/:conversationId     → conversation view (stream + composer)
   ?thread=<ts>                    → thread panel open on that thread
```

Secondary nav (the Slack-style left column) is the shell's module secondary sidebar,
built exactly like `use-inbox-secondary-nav.tsx`:

- Header: module label + "new message / new channel" actions.
- Sections (ui-core `SidebarNavSectionLabel` + `SidebarRow` primitives):
  - **Overview** link
  - **Channels** — `#name` rows, unread bold + `SidebarMenuBadge` count, muted dimmed;
    trailing `SidebarRowActions` (leave, mute, settings); "+ Add channel" row
  - **Direct messages** — avatar (`Avatar`/`AvatarStack` for mpim) + presence-less name
    rows; "+ New DM" opens a user/agent picker
  - Bound project channels show a small project glyph; agent members show the agent
    avatar in the channel detail header via `AvatarStack`

### 6.2 Conversation view

Master-detail inside the content area, mirroring the inbox page layout
(`inbox-client-page.tsx` pattern):

- **Header**: channel name, topic (inline-editable via `EditableText`), member
  `AvatarStack`, `DocSidebarToggle` for the details panel; 3-dot menu (topbar pattern)
  with rename/archive/bind-to-project/notification prefs.
- **Message stream**: virtualized list, day dividers, **grouped consecutive messages
  by same author within 5 min** (Slack style: avatar + name + time on group head only).
  Each message: Streamdown-rendered `text` (mention tokens pre-resolved to chips),
  attachment tiles (`AttachmentImageTile`/`AttachmentFileBadge` reuse), reactions row
  (pill per emoji, click toggles, `+` opens `ui-core` `EmojiPicker`), reply summary bar
  ("3 replies · last reply 2h" + participant `AvatarStack`) when `reply_count > 0`.
  Hover action bar: react, reply in thread, pin, create-task, edit/delete (own).
- **Composer**: the ai-ui `prompt-input` primitives (form, attachments grid, speech
  button) with a team-chat mention extension (§8.1). Enter sends; Shift+Enter newline.
- **Thread panel**: right-side pane (`Pane` + `PaneResizeHandle` +
  `usePersistedEwResizePaneWidth`; overlay Sheet under 800px like `DocSidebarLayout`):
  parent message pinned on top, replies below, own composer. See §7 for the engine.
- **Details panel** (`DocSidebarLayout`): about (topic/purpose/created-by), members
  list with add/remove (users and agents), pinned messages, project binding card with
  activity-event checkboxes, notification prefs — as `SettingsSection` +
  `.ui-canvas-panel` cards.

### 6.3 Live updates

`registerLiveBinding` (tenant scope) on `module_team_chat.conversations` and
`conversation_members` → invalidates the sidebar/list queries; runtime-built
`LiveCacheBinding[]` per open conversation (the `tasks-live-cache.ts` pattern) on
`messages` + `reactions` filtered `conversation_id=eq.<id>` → invalidates
`teamChatKeys.history(id)` / `.replies(id, ts)`. RLS from §4.3 guarantees subscribers
only ever receive rows of conversations they can see. Optimistic append on send,
reconciled by the query invalidation. (This is deliberately *not* the run-event SSE
path: postgres_changes is multi-instance-safe, whereas the run event bus is in-process
only — SSE is used solely for live agent-run token streaming, §7.3.)

### 6.4 Empty/edge states

`Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription` for: no conversations yet, empty
channel ("Send the first message"), archived banner, load-failed.

### 6.5 Overview page (module home)

Blended collapsing header (offers `document-header.tsx` pattern with
`usePageConfig({topbarChrome:"contentBlend", topbarOverlap:true})`), then streams as
`.ui-canvas-raised` card sections:

1. **Mentions & threads** — messages mentioning me + threads I participate in with new
   replies (from `mentions` + thread rollups vs `last_read_ts`), each row deep-links.
2. **Unread channels** — per conversation: name, unread count, last message snippet.
3. **Recent activity** — latest messages across my conversations (excluding muted),
   Slack "All unreads/Activity" hybrid.

All three are plain queries over the §5 ops; live via the same bindings.

---

## 7. Thread engine reuse (the core UI decision)

The ai-ui engine has three clean seams (verified): presentational transcript
components, the headless `<EngentyAgent>`/`useEngentyCopilot` run lane, and the
`ai.thread*` store. team-chat uses the first two and links to the third:

### 7.1 Presentational reuse (all threads)

Channel messages are **not** `ai.thread_message` rows, but the message *body* renders
with the same components: `MessageResponse` (Streamdown: GFM + code + math + mermaid),
`copilot-attachment-preview` semantics for files, and the `ai-elements/prompt-input/*`
composer. A thin `TeamChatMessage` component provides the multi-author chrome (avatar,
name, time, hover actions, reactions) that the copilot transcript doesn't need — the
copilot transcript is role-based (user/assistant), a channel is N-author, so the list
shell is ours, the content rendering is shared. This keeps channel threads visually and
behaviorally identical to agent chat where it matters (markdown, code blocks,
attachments, streaming shimmer).

### 7.2 Human-only threads

Thread panel = parent + replies rendered with `TeamChatMessage` + shared composer.
Nothing agent-specific loads.

### 7.3 Agent-involved threads (the "same engine" payoff)

When an agent is engaged in a thread (mentioned, or a member agent decides to reply):

1. `team_chat_post_message` detects the `<@agent:…>` mention (or the channel's default
   agent) and dispatches an **agent run**: find-or-create the linked `ai.thread` via
   `agent_thread_links` (stable key `team-chat:<conversationId>:<thread_ts>` as
   `stable_session_key`), seed it with the channel-thread context (recent messages,
   conversation topic, bound project entity ref), then start a run — the same
   dispatch path the scheduler/tasks use (queue `agent_task_dispatch` → conversation
   run as a resolved user scope).
2. **Live experience**: the thread panel, seeing an active run on the linked thread,
   mounts `<EngentyAgent threadId={ai_thread_id} hostKey=…>` and renders the streaming
   turn with `CopilotTranscript` underneath the channel messages — full tool-call
   cards, chain-of-thought, HITL interrupt cards, exactly like copilot chat. Multiple
   viewers can attach (the run SSE supports late-join/multi-attach).
3. **Durable result**: on run completion, the agent's final text is posted back as a
   real channel message (`agent_type_key` author, `metadata.event_type:
   "agent_response"`, `metadata.event_payload.ai_thread_id` + `run_id`). The channel
   store stays the Slack-compatible source of truth; the `ai.thread` holds the full
   reasoning/tool transcript, one click away ("View agent run" on the message opens
   the linked thread in the copilot pane).

This split — channel messages as durable Slack-shaped record, linked `ai.thread` as
the live run substrate — is what lets the module be simultaneously Slack-compatible
*and* a full agent surface, without forking either engine.

---

## 8. Mentions & delegation

### 8.1 Composer mentions

Extend the existing textarea mention machinery (`getMentionQueryAtCursor`,
`copilot-composer-mention-popover`) — today it only lists agents; team-chat provides a
candidate source of **tenant users + channel-member agents + `@here`/`@channel`**
(users via the team module / core users API, agents from the agent registry).
Insertion serializes to Slack tokens in `text`: `<@u:uuid>` (users),
`<@agent:agent_type_key>` (agents — deviation from Slack's flat `<@U…>`, folded back
to plain `<@U…>` at the bridge), `<!here>`, `<!channel>`. Renderer resolves tokens to
inline chips (name + avatar hover-card).

### 8.2 Mention effects (post-time, in `team_chat_post_message`)

1. Rows written to `mentions`.
2. **User mention** → `emitInboxNotification({kind: "chat_mention", source:
   "team-chat", metadata: {conversation_id, ts, thread_ts}})` — surfaces in the
   platform inbox + app-bar badge via the existing `useBadgeCount` seam. `@here` /
   `@channel` fan out to (non-muted) members.
3. **Agent mention** → agent run per §7.3 (`app_mention` event shape). An agent
   mentioned in a channel it's not a member of politely refuses via a system message
   unless auto-join is allowed by settings.

### 8.3 Task delegation from messages

"Create task" hover action + a `/task` composer command open a pre-filled dialog:
title from message text, description with a permalink back, assignee defaulted to the
mentioned principal. Submission calls the **tasks module ops** (`tasks_create`) via
the module client — assignment machinery is already polymorphic
(`primary_assignee_kind: user|agent`), and agent-assigned tasks auto-dispatch through
the existing `agent_task_dispatch` queue. The created task links back: message gets a
reply (subtype `activity`, `metadata.event_type: "task_created"`, entity ref
`{module:"tasks", entity:"task", id}` as a context-graph `ExternalRef`), and if the
channel is project-bound the task is created in that project (via the
projects→tasks bridge context). So "delegate to user/agent" = mention for attention,
task for accountable work — both flows first-class.

---

## 9. Agents posting to channels (AI tools)

`ai/registrar.ts` (`defineModuleAi`) exposes tools that delegate to the §5 operations
(never the DB — capability gating and audit come free):

- `team_chat_list_channels_tool`, `team_chat_read_history_tool`,
  `team_chat_read_thread_tool` (read group)
- `team_chat_post_message_tool`, `team_chat_reply_in_thread_tool`,
  `team_chat_add_reaction_tool` (write group)

Rules encoded in tool descriptions + op layer: agents post only to conversations
they're members of (or public channels when granted `.write`); posts always carry
`agent_type_key` authorship — an agent can never impersonate a user. This gives every
agent in the workspace (copilot, task runs, scheduler heartbeat digests, briefing
flows) a sanctioned way to post to channels, which is also what the activity streamer
(§10) and future digest features build on.

---

## 10. Project binding

### 10.1 The tab (zero projects-module changes)

The tab-contribution system is already live (`PROJECTS_DETAIL_SURFACE =
"projects.detail"`, `registerTab`, per-project `enabled_tabs` config —
`modules/files/ui/plugin.ts:59` is the working precedent). team-chat contributes:

```ts
engenty.UI.registerTab({
  id: "chat", surface: PROJECTS_DETAIL_SURFACE,
  component: ProjectChatTab, labelKey: "team-chat:projectTab", order: 350,
});
```

`ProjectChatTab` (receives `{params: {projectId}}`): if a conversation with
`project_id = projectId` exists → render the conversation view embedded (same
components as §6.2, sans secondary nav); else → an empty-state card: "Create #<project>
channel" / "Bind existing channel" (calls `team_chat_bind_project`). The tab appears in
the project's tab-config dialog automatically and only while the module is enabled.

### 10.2 Activity streaming into the channel

Per-channel `settings.activity = {enabled, events: ["task_status", "task_comment",
"task_assignee", "phase", "files", ...]}` edited in the details panel / tab header.

Event source — two-step plan, because projects/tasks currently write **audit records
only** and don't emit on the subscribable module bus:

1. **Additive emits (small PRs in tasks/projects)**: alongside each existing
   `record(type, detail)` audit call, add `events.modules.emit("tasks.task.updated",
   {tenant_id, task_id, actor_id, changed_fields, context_type, context_id})` etc.
   Canonical `<module>.<entity>.<verb>` names; the pattern (and a proven consumer —
   the tasks trigger subscriber `trigger-event-subscriber.ts`) already exists, as do
   emitters in contacts/inbox/kb. This benefits every future subscriber, not just chat.
2. **team-chat subscriber** (`src/activity/project-activity-subscriber.ts`):
   `events.modules.on(...)` for the relevant names; resolves events to bound
   conversations (`project_id` match, tasks resolved via their project context),
   filters by the channel's `events` setting, debounces bursts (e.g. one message per
   task per 30s window), and posts a system message: `subtype: "activity"`,
   `metadata: {event_type: "task_status_changed", event_payload: {...,
   external_ref: {module:"tasks", entity:"task", id}}}`, text like
   `"<@u:…> moved *Design review* to **done**"`. Rendered as a compact single-line
   activity row (context-block style), visually distinct from human messages, and —
   because it's a normal message with metadata — it round-trips through a bridge.

Until step 1 lands, an interim (behind the same subscriber interface) can poll the
tasks activity table — but the plan is to do step 1 first; it's a few lines per DAL
verb and unblocks event triggers for these modules too.

---

## 11. DMs

- `conversations.open(user_ids | principal list)` → find-or-create `im` (2 principals)
  or `mpim` (3+) via `member_hash`; DMs are never listed to non-members anywhere
  (ops + RLS §4.3).
- **Agent DMs**: opening a DM with an agent is explicitly supported — it behaves like
  a channel where every user message triggers the agent (per §7.3 with the DM's single
  agent as default). This intentionally gives a second door into agent chat with
  team-chat semantics (persistent, searchable-by-owner, reactions), while the copilot
  drawer remains the primary lane; the linked `ai.thread` machinery is identical.
- DM read-marks, mentions, attachments identical to channels; DMs are excluded from
  tenant-wide search visibility (owner-only, §12) and from project binding.

---

## 12. Search & retrieval

1. **v1 lexical**: `team_chat_search_messages` over the GIN FTS index (like
   `module_inbox.search_messages`), membership-filtered.
2. **Central retrieval**: `registerRetrievalSource({source_type: "team-chat.message",
   ...})` with the standard document builder + `onEvents` re-index on
   `team-chat.message.{posted,updated,deleted}` module-bus events (which we emit for
   ourselves anyway — they're also the bridge feed, §14). Visibility filters:
   public/private-channel messages indexed with conversation-membership filter
   metadata; **DM/mpim messages indexed owner-scoped only** (or excluded v1 —
   decision for review; recommendation: excluded v1, owner-scoped later). This makes
   channel knowledge available to `core_workspace_search` and agents.

---

## 13. Notifications & badges

- Per-member `notify_prefs` (`all | mentions | nothing`) + `muted`, edited in details
  panel; defaults: channels → mentions, DMs → all.
- Fan-out inside `team_chat_post_message` → `emitInboxNotification` (dedupe key
  `team-chat:<conv>:<ts>:<user>`), respecting prefs and read state.
- App-bar badge: `useBadgeCount` on the module menu item = mentions + DM unreads
  (not all channel unreads — Slack's home-badge semantics).
- In-module badges: sidebar per-conversation counts from `team_chat_unreads`.

---

## 14. Remote Slack bridge (future phase — designed for, not built)

The connections framework already has everything except the Slack stream:

- **Outbound** (team-chat → Slack): a bridge service in team-chat consumes our own
  Slack-shaped module events (`message` posted/changed/deleted, `reaction_added`, …)
  for conversations whose `external.slack` binding is set, and replays them via
  `createConnectionsModuleClient(...).callAction({connectorId:"slack", actionId:
  "post_message" | "update_message" | "add_reaction", ...})` — the connector already
  ships these actions with `thread_ts` support; policy/approval/audit apply for free.
  mrkdwn/markdown + mention-id translation happens here (§2.3), using the id maps in
  `external`.
- **Inbound** (Slack → team-chat): add a `ConnectorStreamCapability {kind:"messages"}`
  to the Slack connector mirroring the Gmail stream (cursor per channel over
  `conversations.history`; scopes `channels:history`/`groups:history` are already in
  `SLACK_USER_SCOPES`), consumed by a `runTeamChatSync` gateway op exactly like
  `inbox_sync_run` — pull-based v1 (sync interval / trigger-driven), Slack Events-API
  webhook push later. Inbound messages insert with `external.slack.ts` provenance and
  loop-guard (never re-export a message that came from the bridge).
- Because our stored shapes *are* Slack shapes, the mapper is field renames + id maps +
  mrkdwn conversion — the compatibility dividend this whole design pays for.

---

## 15. Phased implementation plan

Each phase is independently shippable and live-verifiable.

**Phase 1 — Scaffold + core messaging.**
Module skeleton (§3), migration (§4), repo + `ts` generator, ops:
conversations list/info/create/open/join/leave/invite/history/replies/mark +
post/update/delete message + users_conversations + unreads. UI: secondary nav,
conversation view (stream, grouping, composer with attachments), thread panel
(human-only, §7.2), realtime bindings, read marks, DMs (im/mpim). Empty states, i18n.
*Exit: two users chat live in channels + DMs across browsers; threads work; unread
badges correct.*

**Phase 2 — Rich content + mentions.**
Reactions (+ EmojiPicker), pins, mention composer (users/agents/here/channel) + chips
+ `mentions` table + inbox notifications + app-bar badge, message hover actions,
edit/delete UX, permalinks, overview page (§6.5), lexical search.
*Exit: mention a user → they get a platform notification and badge; overview streams live.*

**Phase 3 — Agents.**
Agent membership (invite agent), AI tools (§9), agent-mention → linked `ai.thread`
run → streamed reply in thread panel via embedded `CopilotTranscript` → durable
channel message (§7.3), agent DMs (§11), "View agent run" affordance.
*Exit: @-mention an agent in a thread, watch it stream, final answer persists as a
channel message; an agent posts a message via its tool from copilot.*

**Phase 4 — Project binding + activity.**
`registerTab` on `projects.detail` + `ProjectChatTab`, bind/create channel ops + UI,
additive `events.modules.emit` in projects/tasks DALs (separate small PRs), activity
subscriber + settings + activity message rendering, create-task-from-message (§8.3).
*Exit: project tab shows its channel; completing a project task posts an activity line;
"create task" from a message assigns to an agent and dispatches.*

**Phase 5 — Search + polish.**
Retrieval-source registration (§12), overview refinements, notification prefs,
`docs/` user docs, `CLOSED_PREFIXES`/open decision executed, E2E pass.

**Phase 6 (future, separate plan) — Slack bridge** (§14): connector stream capability,
bridge service, id/mrkdwn mappers, loop guards, channel-binding UI on the connection.

Testing throughout: vitest per package (scoped-vitest gotcha applies), repo tests for
`ts` uniqueness/thread rollups/membership enforcement, op-level authz tests
(member vs non-member vs agent), RLS tests for DM isolation, mention-parser unit tests.

---

## 16. Gotchas & open questions

**Known gotchas to respect (from prior phases):**
- `module_channels` residue: the abandoned worktree's baseline migration
  (`20260716090000_plugin_channels_baseline.sql`) is untracked on main (root
  `supabase/migrations/` is gitignored) but has likely been **applied to the shared dev
  DB**. team-chat uses `module_team_chat`, so no collision; when convenient, drop the
  stale `module_channels` schema + its `supabase_migrations` row from the dev DB, and
  delete the stray aggregated file. If `db:migrate` complains after merges, that's the
  known tracking-drift issue → `migration repair --status applied`.
- Run-event bus is in-process only → never rely on it for cross-user message sync;
  postgres_changes is the message-sync channel (§6.3), SSE only for run token streams.
- Realtime membership RLS must use the security-definer helper (recursion precedent).
- Stale UI plugin catalog after merge → `pnpm --filter @engenty/ui generate:plugins`.
- Realtime schema-version mismatch history: any publication change should be
  live-verified against the running container.
- Worktree dev-server: use the per-worktree slot (`dev:portless`), shared supabase.
- Never `git add -A` in a shared checkout; release via the standard flow.

**Open questions for review (Matthias):**
1. **Open vs pro**: module open-source, bridge pro (recommended) — or all pro?
2. **DM search**: exclude DMs from retrieval v1 (recommended) or owner-scoped index?
3. **Default channels**: auto-create `#general` per tenant on module enable?
4. **Agent auto-join**: may a mentioned non-member agent auto-join public channels
   (setting, default on?) or always require explicit invite?
5. **Copilot relationship**: is the agent-DM door (§11) desirable v1, or defer to
   avoid two entry points to agent chat before the object-widgets work lands?
