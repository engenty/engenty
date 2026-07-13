# Time-tracking × calendar integration — design & plan

> **Pro-only (closed).** The `time-tracking` module was pulled back to
> engenty-pro on 2026-07-13; develop this phase in engenty-pro, not the public
> mirror. This doc lives under `docs/internal/` so it never syncs to
> `engenty/engenty`. Land the work directly on pro `main` (`git push origin main`),
> not via `pnpm push`.

Status: PLANNED 2026-07-08, not started.
**Prerequisites (all shipped):** connections framework + multi-account
(`docs/wip/connections-framework.md`, `connections-multi-account-groundwork.md`),
inbox sync pattern (`docs/wip/inbox-module.md`), time-tracking calendar UI with
`start_time` (v0.1.6).

## Goal

1. **Overlay:** show the user's calendar(s) muted in the background of the
   time-tracking calendar view.
2. **Sync back:** push time entries into a chosen calendar; support two-way
   (remote moves/deletes reflect back) via a stable id mapping.
3. **Personal vs company calendars:** conceptualize both (technically near
   identical — it's the connection's `sharing`), and give it a settings UX.

## What already exists (no new connectors needed)

- **Google Calendar connector** `google-calendar` (toolPrefix `gcal`,
  `modules/connections/providers/google/src/connectors/calendar.ts`):
  `list_calendars`, `list_events`, `get_event` (read) · `create_event`,
  `update_event` (write) · `delete_event` (destructive). Scopes
  `calendar.readonly` / `calendar.events`, `calendar_id` defaults `primary`.
- **Microsoft Outlook connector** `microsoft-outlook`
  (`providers/microsoft/src/outlook.ts`): `list_events`, `get_event`,
  `create_event`, `update_event`, `delete_event` via Graph
  (`Calendars.Read(Write)`, `calendarView` for recurrence expansion).
  *Missing vs Google: `list_calendars` and a `calendar_id` param (only
  `/me/events` today).*
- **Module client** `createConnectionsModuleClient(...).callAction({connectionId,
  actionId, input, isAutonomous, principal, tenantId})`
  (`packages/connections-sdk/src/client.ts`) — the one execution path with
  policy + token refresh + audit.
- **Policy semantics that shape the design** (`connections-sdk/src/{execute,policy}.ts`):
  - `read` defaults **allow**; `write` defaults **ask**; `destructive` **ask**.
  - `ask` + live user principal (`isAutonomous: false`, i.e. inside a
    user-initiated request) **proceeds**.
  - `ask` + `isAutonomous: true` → durable approval request + throw; and the
    autonomous clamp requires `autonomous_mode ≥ read_only` for reads,
    `full` for writes.
- **Sync template:** inbox (`modules/inbox/src/sync/sync-service.ts` +
  `module_inbox.sync_state` + dedup unique `(connection_id,
  provider_message_id)`), driven by a **system job** in
  `apps/ai/src/scheduler/system-jobs.ts` that invokes a module operation over
  the service JWT.
- **Settings substrate:** `packages/user-settings` (`user_settings` KV with
  dot-prefix `list`) and `packages/tenant-settings`.
- **No push/webhook infra** — connector inbound is polling only. Google
  `events.watch` / Graph subscriptions would be net-new infrastructure
  (explicitly out of scope here; the tasks webhook edge exists if we ever
  want it).

## Decisions (proposed)

| Decision | Choice |
|---|---|
| Overlay data plane | **Live pull, no mirror store** — `list_events` per visible window, cached client-side (react-query, ~2 min staleTime). Calendar events are not our data; mirroring adds a store + staleness for no v1 benefit. |
| Overlay principal | Fetch inside the user's request (`isAutonomous: false`, user principal) → read actions default-allow, personal connections visible only to their owner. Privacy falls out for free. |
| Entry→event mapping store | Side table `module_time_tracking.calendar_links` (NOT columns on `time_entries`) — keeps the core table clean, supports re-targeting and multiple providers later. |
| Two-way identity | Both directions: we store `provider_event_id` (+ etag) locally, **and** stamp our entry UUID onto the remote event (Google `extendedProperties.private.engenty_entry_id`, Outlook open extension). Survives event copies and lets us re-match after cursor loss. |
| Push timing | **In-request push** on entry create/update/move/delete (user principal → `ask` proceeds, feels instant) **+ reconcile system job** (repair drift, retries, pull-back). |
| Background writes consent | Reconcile job runs `isAutonomous: true`: needs connection `autonomous_mode: full` and effectively an `allow` override on `group:write` — the settings UI must say so and deep-link to the connection panel. Without it, sync degrades gracefully to in-request pushes only. |
| Remote delete of a linked event | **Unlink + flag** (`link.status = 'remote_deleted'`), never delete the time entry — tracked hours are billing data. |
| Remote move/resize (2-way pull) | Update entry `date`/`start_time`/`hours` from event start/end. Time fields only; title/notes never pulled back in v1. |
| Conflict rule | Compare `time_entries.updated_at` vs event `updated`; newer wins. Loop prevention via `sync_hash` on the link row (skip pull-back when remote state equals what we last wrote). |
| Entries without `start_time` | **Not synced** (they'd be arbitrary blocks). The UI already shows them as "unscheduled"; hint in settings. |
| Whose entries sync where | Only the entry's `user_id` syncs to *their own* target calendar. Admin-entered entries for user X land in X's calendar iff X enabled sync — never in the admin's. |
| Personal vs company | Not a new concept: **personal calendar = personal-sharing connection** (owner-only), **company calendar = org-shared connection** (e.g. a shared Google account / resource calendar). Overlay supports both; write-target for entries is personal-only in v1. |
| Settings home | Per-user choices in `user_settings` under `time-tracking.calendar.*`; tenant defaults (suggested company overlay calendars) in `tenant_settings`. Sync enable/cursor state per connection in `module_time_tracking.calendar_sync_state` (clone of inbox `sync_state`). |

## Data model (one migration)

```sql
-- links: local entry ⇄ remote event
create table module_time_tracking.calendar_links (
  entry_id text primary key references module_time_tracking.time_entries(id) on delete cascade,
  tenant_id uuid not null,
  connection_id uuid not null,          -- module_connections.connections
  calendar_id text not null,            -- provider calendar (e.g. "primary")
  provider_event_id text not null,
  etag text,                            -- gcal etag / graph @odata.etag
  sync_hash text,                       -- hash of (date,start_time,hours,title) we last pushed
  status text not null default 'linked',-- linked | remote_deleted | error
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_ttcal_links_provider
  on module_time_tracking.calendar_links (connection_id, provider_event_id);

-- per-connection sync state (clone of module_inbox.sync_state)
create table module_time_tracking.calendar_sync_state (
  connection_id uuid primary key,
  tenant_id uuid not null,
  owner_user_id uuid,
  sync_enabled boolean not null default false,
  target_calendar_id text,              -- where entries get written
  cursor text,                          -- gcal syncToken / graph deltaLink (phase 3)
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz
);
```

User settings keys (per user, `packages/user-settings`):

- `time-tracking.calendar.overlays` — `[{connectionId, calendarId, label}]`
- `time-tracking.calendar.overlay_enabled` — bool (quick toggle in toolbar)

Tenant settings key: `time-tracking.calendar.company_overlays` — suggested org
calendars pre-checked for everyone (admin-managed).

## Entry → event mapping

- `start = date + start_time`, `end = start + hours` (local tenant TZ; gcal
  `dateTime` with tz, Graph `timeZone` param).
- Title: `⏱ {project_title}{ – task_title}{ · discipline}`; description ←
  `notes` + a plain-text footer "Synced from engenty time tracking".
- Google: `extendedProperties.private = { engenty_entry_id, engenty_tenant_id }`.
- Outlook: open extension `com.engenty.timeTracking` with the same fields.

## Phases

### Phase 1 — Overlay (read-only background calendars)

1. **Connector touch-ups** (small): Outlook `list_calendars` action +
   `calendar_id` on its event actions (Graph `/me/calendars/{id}/calendarView`).
2. New module operation `time_tracking_calendar_events_list({week_start,
   span})`: reads the user's overlay settings, fans out `list_events` per
   `(connectionId, calendarId)` via the module client (user principal,
   `isAutonomous: false`), normalizes to
   `{id, calendar_key, title, start, end, all_day}`. Failure-isolated per
   calendar (one broken account ≠ empty overlay).
3. UI: separate react-query key (own loading state, doesn't block entries);
   new read-only layer in `CalendarGrid` — muted blocks
   (`color-mix(... 12%, transparent)`, dashed border, no pointer handlers,
   rendered *under* entry blocks), all-day events as a thin strip under the
   day header; toolbar eye-toggle. Timeline/sums untouched.
4. Settings dialog v1 (in the calendar toolbar): pick connection →
   `list_calendars` → checkbox overlay calendars.

### Phase 2 — Push sync (entries → calendar, one-way write)

1. Migration above; DAL for `calendar_links` + `calendar_sync_state`.
2. **Connector touch-ups**: gcal `create_event`/`update_event` accept
   `private_properties` (→ `extendedProperties.private`) and return
   `id + etag`; Outlook equivalents via open extensions.
3. `calendar-sync-service.ts` in `modules/time-tracking/src/sync/`:
   `pushEntry(entryId)` — create/update/delete remote event per link state,
   write back `provider_event_id`/`etag`/`sync_hash`.
4. In-request hook: gateway write-ops fire `pushEntry` after successful
   mutation (best-effort; failure marks `link.status='error'`, never fails
   the entry write).
5. Reconcile: module operation `time_tracking_calendar_sync_run` (service
   repo, mirrors `inbox_sync_run`) + system job `time-tracking-calendar-sync`
   (`*/15 * * * *`) in `apps/ai/src/scheduler/system-jobs.ts` — retries
   errored links, pushes entries created while sync was off, deletes events
   for deleted entries (`destructive` → requires the consent posture above;
   else queued as approval).
6. Settings: enable sync per connection + pick `target_calendar_id`; UI
   surfaces the `autonomous_mode: full` requirement with a deep link.

### Phase 3 — Pull-back (true two-way)

1. **Connector touch-ups**: gcal `list_events` exposes `sync_token` in/out
   (and `updated_min` fallback); Outlook delta later — v1 pull-back can be
   Google-only, Outlook stays push-only until delta lands.
2. Extend the reconcile run: incremental pull per synced connection
   (cursor in `calendar_sync_state.cursor`, expiry → null-reset re-list,
   links absorb the overlap); match on `provider_event_id` (fallback: our
   stamped entry UUID); apply the conflict rule; remote deletions →
   `remote_deleted` + (optional) notification via the existing inbox/
   notifications seam.
3. Guardrail: pull-back only touches entries **with an existing link** —
   foreign calendar events never create time entries in v1 ("promote event
   to time entry" is a natural later feature, via click on an overlay block).

### Phase 4 — Personal vs company UX + settings page

1. Dedicated settings surface (route `/mdl/time-tracking/settings` or a
   section in the existing settings area):
   - **My calendars**: overlay picker (grouped: *Personal* = own personal
     connections, *Company* = org-shared connections), sync target + toggle,
     consent status per connection (autonomous mode / policy hints).
   - **Admin (company)**: manage `company_overlays` tenant defaults; pointer
     to `/settings/connections` for connecting a shared org account.
2. Overlay legend/colors: stable muted hue per calendar (reuse
   `hashString` → chart palette at low mix).
3. Team view consideration: when an admin views another user's week, overlays
   stay **viewer-scoped** (you see *your* calendars, or none) — never another
   user's personal calendar.

## Open questions (user)

1. Overlay in day/3-day/week only, or also a dot/strip in the table view?
   (Assume calendar view only.)
2. Push scope: sync **all** scheduled entries of a user, or opt-in per entry?
   (Plan assumes all-with-start_time once enabled.)
3. Outlook parity in v1 or Google-first? (Plan: overlay+push both providers,
   pull-back Google-first.)
4. Should deleting a *linked calendar event* in the UI offer "delete remote
   event too"? (Plan: yes via the reconcile delete, subject to consent.)

## Effort sketch

- Phase 1: ~1 day (connector touch-ups + op + overlay layer + mini settings).
- Phase 2: ~1.5–2 days (migration, sync service, hooks, system job, consent UX).
- Phase 3: ~1 day (Google sync tokens, conflict/loop handling, tests).
- Phase 4: ~0.5–1 day (settings page, admin defaults, polish).
