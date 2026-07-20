# engenty-remote module — agent guide

PRO module `@engenty/engenty-remote` at `modules/engenty-remote/` (in CLOSED_PREFIXES). External messengers (Slack, Telegram, WhatsApp, Teams) as chat interfaces to engenty agents, built on Mastra `channels` (`@mastra/core/channels`, which embeds Vercel Chat SDK + `@chat-adapter/*`).

## Split of responsibilities

- **This module**: the `engenty.remote` agent (chat-tuned, catalog meta-tools, brevity contract in `ai/agents/engenty.remote/AGENTS.md`), `module_remote` schema, gateway ops for bindings/identities/pairing, settings UI.
- **apps/ai `src/api/remote-channels.ts`**: the channel runtime — persistent channel-bound Agent, webhook route mounting, per-event identity gate + ALS scope injection, outbound consumer. apps/ai imports this module from **dist** (`@engenty/engenty-remote/ai/remote`), while apps/core loads `src/plugin.ts` via jiti from **source** — that's why `ai/remote.ts` passes explicit `candidateRootSegments` for agent assets.

## Schema (`module_remote`)

- `bindings` — one platform workspace/bot ↔ one tenant; `unmapped_sender_policy` (`ignore` | `invite` | `deny`), `capability_ceiling`, optional `connection_id`/`external_workspace_id`.
- `identities` — verified (platform, external_user_id) → engenty user mapping, created by pairing.
- `pairing_requests` — one-time codes handed to unmapped senders; claiming (logged in) creates the identity.
- `conversations` — external thread ↔ Mastra thread linkage. `inbound_events` — webhook dedup.
- Queue `remote_outbound` (pgmq) — proactive messages, consumed by apps/ai.

Access: service_role only (RLS enabled, no authenticated policies) — everything goes through gateway ops.

## Key invariants

- A run acts with the **mapped user's** authority (delegated actor token from core), never more; unmapped senders only ever see a pairing invite (or silence/denial per binding policy).
- Chat-surface output stays inside the brevity contract; rich content is a deep link into engenty.
- Env flags: `ENGENTY_REMOTE_CHANNELS_ENABLED` (opt-in master), plus per-platform credentials (see `docs/content/dev/remote-channels.md`).

## Gotchas (hard-won, keep)

- `chat` version must be single-instance: root pnpm override `"chat"` pins it because `@chat-adapter/*` pin exact versions while `@mastra/core` uses a caret range.
- `@chat-adapter/*` are ESM-only.
- Mastra `getWebhookRoutes()` returns `createHandler`-variant ApiRoutes — await `createHandler({ mastra })`.
- Commit via `git push origin HEAD:<branch>` from worktrees; module stays out of the public mirror.
