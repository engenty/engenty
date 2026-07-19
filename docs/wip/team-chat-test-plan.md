# team-chat — test plan

Status: living document (2026-07-18). Automated coverage runs in CI
(`pnpm --filter @engenty/team-chat test` + repo `check`/`typecheck`); the manual
matrix is the release gate for module changes and has been executed against the
worktree dev stack (slot 4, `pnpm dev:portless --domain=team-chat`).

## 1. Automated (vitest, module-scoped)

| Area | File | Covers |
|---|---|---|
| Mention parsing | `src/lib/mentions.test.ts` | token extraction (user/agent/here/channel), dedupe, lowercase-normalization, malformed-token rejection; DM `memberHash` order/case-insensitivity |
| Agent dispatch | `src/api/agent-mention-queue.test.ts` | one dispatch per distinct agent, user/broadcast mentions ignored, root-ts threading, null-queue no-op |
| Activity lines | `src/lib/activity.test.ts` | status transitions, title + clamped comments, missing payloads |
| Mention rendering | `ui/lib/format.test.ts` | fragment-href mention links, plain-text previews, deterministic author colors, message grouping window |

Repo gates: `biome check`, module `tsc --noEmit`, tsup build (all green as of
2026-07-18). DB-level invariants (ts uniqueness/retry, thread rollups ±,
mention insert, tombstones) were verified directly against the dev DB inside a
rolled-back transaction (Phase 1) — promoting those into a pgTAP or
testcontainer suite is the main automation gap.

## 2. Manual E2E matrix (browser, dev stack)

Legend: ✅ verified (date) · ◻ not yet re-verified after latest change.

**Core messaging (Phase 1)** — all ✅ 2026-07-17
- Create channel (dialog, duplicate-name error), sidebar updates live
- Post message; markdown (bold/code) renders; day divider; author grouping
- Thread: reply, rollup count + participants on parent, live update w/o reload
- DMs: open, dedup on reopen (same conversation id), peer naming
- Read cursors: unread badge appears for other-authored posts, clears on view

**Rich content (Phase 2)** — all ✅ 2026-07-17
- Reaction add via API appears live (postgres_changes), pill toggle off via UI
- Mention popover: filter, keyboard nav, token insert; mention row persisted
- Edit-in-place with `(edited)`; delete tombstone; pins add/list
- Lexical search finds messages, membership-scoped, deep-links

**Agents (Phase 3)** — ✅ 2026-07-17
- @agent mention → queued → consumer runs agent → threaded agent-authored
  reply with AGENT badge + View-run link; `agent_thread_links` row written
- Kill-switch honored; malformed queue payloads dropped with log

**Project binding + activity (Phase 4)** — ✅ 2026-07-18
- Chat tab hidden by default, enabled via project tab-config dialog
- Create+bind names channel from project title; embedded view renders
- Task status change → readable activity line in bound channel

**Attachments + emoji** — ✅ 2026-07-18
- Paste image → chip w/ thumbnail → upload → inline image render (signed URL)
- File picker path; attachment-only send; emoji insert at cursor

**Phase 5 additions**
- ✅ Flat project-tab styling (no card chrome) — 2026-07-18
- ✅ Mention chips show colored backgrounds (light + dark) — 2026-07-18
- ✅ Channel details popover: members list, invite user, invite agent, remove
  member — 2026-07-18. Activity toggle suppression — 2026-07-19: with
  `settings.activity.enabled=false`, a task status change (`tasks_update`) posts
  **no** activity line (count held at 3; the task itself still transitioned, so
  it's the feed that's gated, not the update); re-enabling resumes posting.
- ✅ Workspace search returns channel messages (`team-chat.message` source);
  DMs never appear in results — 2026-07-19. Backfill 14/0 processed/failed →
  13 channel docs (the lone `im` message excluded); a freshly posted message
  auto-indexes via `onEvents` in <5 s; both `team_chat_message_search` and the
  federated `core_workspace_search` return the hit.
  - Regression fixed here: the source selected `messages.scope_id` (that column
    lives on `conversations`), so every `buildDocument` threw and indexing
    silently produced **zero** documents on both the live and backfill paths.
    Read `scope_id` from the embedded `conversations` join. **Add a check to the
    security/regression list: after any schema change, re-run a backfill and
    assert `failed === 0`** — swallowed `onError` makes this failure invisible
    in the UI.

**UI polish round (2026-07-19, @ d9b6503)**
- ✅ Threads closed by default (reply-count bar only; open via bar or toolbar)
- ✅ Toolbar thread button opens a reply composer on reply-less messages
- ✅ Emoji picker anchors to the toolbar (action bar pinned while popover open;
  was jumping to the viewport origin when its hidden-on-unhover anchor unmounted)
- ✅ Search-index console (`/settings/search-index`, superadmin + developer
  mode): team-chat.message card shows clean 17/17 · 0 missing after rebuild;
  attachment-only (empty-text) messages excluded from the doc list
- ◻ Tooltips on toolbar/composer icon buttons — wiring matches the proven
  task-card pattern; CDP hover can't trigger Base-UI tooltips (driver
  artifact), re-check by hand

**Activity dashboard (2026-07-19, @ ba44806)**
- ✅ Mentions card shows a freshly posted `<@u:me>` message w/ author, channel
  chip, relative time; deep-links to the channel
- ✅ Threads card lists roots I authored/replied in (jsonb `reply_users` needs
  two queries — `cs` in `.or()` 400s silently)
- ✅ Unreads w/ badges, recent w/ previews + clamped relative times
- ✅ Quick actions open the New-Channel / New-DM dialogs

**Design update (2026-07-19, @ 1f6a435) — gemeinsamer Browser-Test steht aus**

> Vorab-Durchlauf (Claude, 2026-07-19, live im dev stack): Dashboard-Kopf/CTAs/
> Statistik/Karten, Tab-Leiste inkl. ×-Close + localStorage, Channel-Kopf mit
> Avatar-Stack/Typ-Chip/Projekt-Chip (Name aufgelöst, „waff website support"),
> Pins-Popover inkl. `?ts=`-Sprung, Thema-bearbeiten-Dialog (gespeichert +
> sofort im Kopf), DM ohne Typ-Chip, Autor-Farben orange/violett — alles ✓.
> Dabei gefixt (im Design-Update-Follow-up-Commit): **(1)** Channel-Kopf zeigte
> „0 Mitglieder" — die `list_my_conversations`-RPC füllt `members` nur für
> `im`/`mpim`; der Header lädt die Roster jetzt über `useMembersQuery`.
> **(2)** `?ts=`-Flash konnte bei einem Refetch im 3,5-s-Fenster dauerhaft
> stehen bleiben (Cleanup killte den Fade-Timer) — Fade in eigenem Effekt.
> **(3)** Pins-Popover blieb nach Klick auf einen Eintrag offen — schließt
> jetzt kontrolliert. Offen für den gemeinsamen Test: Tab-Indikatoren
> (Sky-Punkt/Indigo-Zähler — brauchen frische Mentions/Unreads), Zentrierung
> auf breitem Viewport, Embedded-Projekt-Tab, Join-Bar/Archiv-Regressionen.

*Dashboard (`/mdl/team-chat`)*
- [ ] Verschmolzener Kopf: weiße Zone ohne Trennlinie zwischen Topbar und
  Titel „Team-Chat" + Untertitel (ungelesen-Zähler); Inhalt zentriert
  (Kopf-Spalte und Content-Spalte fluchten, max-w-5xl)
- [ ] Top-Nav-CTAs rechts: „Direktnachricht" (outline) + „Channel" (primär)
  öffnen die Dialoge; ⋯-Menü → „Aktualisieren" lädt die Feeds neu
- [ ] Tab-Leiste unter dem Titel: „Übersicht" aktiv (Ember-Unterstrich);
  nach dem Öffnen von Channels erscheinen sie als Tabs (max. 5, zuletzt
  geöffnet zuerst); Hover zeigt ×; × schließt den Tab dauerhaft
  (localStorage `engenty.team-chat.recent-tabs`); Tab-Klick navigiert
- [ ] Tab-Indikatoren: Sky-Punkt bei Erwähnung, Indigo-Zähler bei ungelesen
- [ ] Statistik-Zeile im Content: 4 Kacheln (Sky @ Erwähnungen, Indigo ✉
  Ungelesen, Violet ⇄ Threads, Amber ⚲ Angepinnt) mit korrekten Zahlen
- [ ] Karten-Köpfe mit getönten Icon-Badges; Ungelesen-Zeilen: Sky-Punkt +
  fette Vorschau, KEIN linker Farbbalken
- [ ] Autor-Farben in den Feeds: Menschen orange, Agenten violett (+ Bot-Icon)

*Channel-Ansicht (`/mdl/team-chat/<id>`)*
- [ ] Channel-Kopf: Icon-Badge (#/Schloss/Personen) + Name + Thema;
  Meta-Zeile: Avatar-Stack (inkl. Agent-Initialen), „N Mitglieder · N
  Agents", dezenter Typ-Chip („Öffentlich"/„Privat"); KEINE Tab-Zeile
- [ ] Projekt-Chip (Indigo) nur bei projektgebundenem Channel; zeigt den
  Projektnamen und verlinkt auf `/mdl/projects/<id>`
- [ ] Top-Nav-Aktionen: Pin-Icon → Popover mit angepinnten Nachrichten
  (Klick springt + flasht via `?ts=`); Info-Icon → Mitglieder/Details;
  ⋯-Menü → „Thema bearbeiten" (Dialog, speichert), „Aktualisieren",
  „Channel verlassen" (rot, nur Channels; navigiert zur Übersicht)
- [ ] Stream: Menschen-Autoren einheitlich orange, Agenten violett mit
  AGENT-Badge (vorher: Hash-Palette pro Person — darf nicht mehr auftreten)
- [ ] DM: kein Typ-Chip, kein „Channel verlassen"; Details/Pins vorhanden
- [ ] Embedded (Projekt-Tab „Chat"): unverändert OHNE Channel-Kopf
- [ ] Regression: Beitreten-Leiste (Nicht-Mitglied), Archiviert-Banner,
  Thread auf/zu, Composer, Deep-Link `?ts=` (Scroll + Amber-Flash)

## 3. Security/regression checklist (each release)

- Private channel/DM invisible to non-member: list, info, history, search,
  realtime (second browser session)
- Agent cannot post to a private channel it is not a member of
- Service caller cannot post non-`subtype` messages
- `<@u:…>` tokens never leak raw ids in previews (plain-text rendering)
- After any `messages`/`conversations` schema change: run the `team-chat.message`
  backfill and assert `failed === 0` (indexing errors are swallowed by the host's
  `onError`, so a broken `buildDocument` shows no UI symptom)

## 4. Known gaps / future automation

- pgTAP/testcontainers for DB functions + RLS (§1 note)
- Playwright flow for the §2 matrix (blocked on shared login fixture)
- Bridge (Phase 6) contract tests: mrkdwn↔markdown, id mapping, loop guard
