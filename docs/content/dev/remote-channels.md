---
title: Remote channels
description: External messengers (Slack, Telegram, …) as chat interfaces to engenty agents via Mastra AgentChannels — the engenty-remote module and the apps/ai channel runtime.
---

# Remote channels (engenty-remote)

External messengers become chat interfaces to engenty agents. A message to the
bot (Slack DM or @-mention, Telegram chat) runs the chat-tuned
**`engenty.remote`** agent — full tool catalog, short answers, deep links
instead of rich UI — and the reply posts back natively on the platform, with
the **sender's own engenty permissions**.

Built on Mastra's `channels` layer (`@mastra/core/channels`), which embeds
Vercel's Chat SDK (`chat` + `@chat-adapter/*`): webhook signature verification,
platform thread ↔ agent thread mapping, typing status, streamed post+edit
replies, tool-display rendering, and tool-approval cards with in-place resume
all come from that pipeline.

## Architecture

- **`modules/engenty-remote`** — the module: `engenty.remote` agent definition
  (AGENTS.md carries the brevity contract), `module_remote` schema (bindings,
  identities, pairing requests, conversations, inbound dedup), gateway ops for
  binding management + pairing + runtime resolution, and the settings UI
  (`/mdl/engenty-remote/settings`, pairing claim at `/mdl/engenty-remote/pair`).
- **`apps/ai/src/api/remote-channels.ts`** — the channel runtime: persistent
  channel-bound Agent built from the module's config, registered on the Mastra
  instance (initializes `AgentChannels`), webhook routes mounted on the apps/ai
  Hono app, plus the `remote_outbound` queue consumer for proactive sends.
- **`POST /api/auth/actor-token`** (core) — the AI service mints a short-lived
  (60–900 s) token carrying a target user's resolved grants; delegation chain
  in the claims, audited as `auth.actor_token_minted`. Capability gate:
  `core.users.impersonate` (admins and the service principal via `*`).

## The identity gate (every inbound event)

1. **Binding** — `remote_runtime_resolve_sender` resolves platform (+ optional
   workspace id) → the tenant's binding. No active binding → drop.
2. **Sender** — verified identity lookup (platform, external user id). Unmapped
   senders follow the binding's `unmapped_sender_policy`:
   `ignore` (silence) · `invite` (one-time pairing link, 15-min TTL) ·
   `deny` (short refusal).
3. **Authority** — mapped senders get a delegated actor token (cached, refreshed
   60 s before expiry); the whole turn runs inside the engenty-tools ALS scope
   with that token, so every catalog tool executes with the user's own
   capabilities. Gated operations use `approvalPolicy: "suspend"` — Mastra
   channels renders the Approve/Deny card in the platform thread and resumes.

## Pairing

An unmapped sender (invite policy) receives a link to
`/mdl/engenty-remote/pair?code=…`. Logged into engenty, they see what's being
linked and confirm — `remote_pairing_claim` creates the verified identity.
Admins can revoke identities in the settings page any time.

## Conversations = a routing table + a real engenty thread

`module_remote.conversations` is a **routing table**, not a message store: it
maps a platform thread to its tenant, binding, and backing engenty thread
(`ai_thread_id`), written by `remote_runtime_resolve_sender` on every inbound
event. The identity gate provisions a **dedicated `engenty.remote` thread** in
`ai.thread` for each platform thread (pre-creating the Chat SDK mapping thread
with the same UUID so the SDK adopts it), and binds tenant-scoped memory per
turn — so channel messages persist in `ai.thread_message` with the same
isolation and UI surface as web chat. Remote conversations are never mixed
with copilot threads unless the user explicitly `/link`s one.

Inbound events are deduped durably in `module_remote.inbound_events`
(Chat SDK's own dedup is in-memory by design, so a restart inside a platform's
retry window would otherwise double-reply); rows are pruned after 7 days on
the ingest path. Workspace routing is anchor-first: the gate forwards the
platform workspace id (Slack `team_id`) and binding resolution falls back to a
platform-only match **only** when exactly one anchor-less binding exists —
ambiguity refuses rather than guessing a tenant.

## Chat controls

Parsed in the gate before the agent — only exact tokens; anything else
(including unknown `/words`) reaches the agent:

- `/new` — start a fresh conversation (this platform thread gets a new engenty thread)
- `/threads` — list your recent remote threads
- `/link <thread-id>` — continue an existing engenty thread here (ownership-checked; the only sanctioned mixing with non-remote threads)
- `/help`

## Proactive messages

The `remote_notify` gateway op (capability `module.engenty-remote.write`, also
callable by agents through the tool catalog) enqueues
`{ platform, external_thread_id, text }` onto the `remote_outbound` pgmq queue;
the apps/ai consumer delivers via the live Chat SDK (`chat.thread(id).post`).
Destination authorization: the op refuses any thread the tenant has no
conversation row for — an agent cannot aim the bot at arbitrary threads.

## Enabling (dev)

Configuring a platform is what turns the runtime on — there is no separate
opt-in. `ENGENTY_REMOTE_CHANNELS_ENABLED=false` is the kill switch over the top,
for shutting ingress off without rotating or deleting a bot token.

```bash
ENGENTY_AI_SERVICE_JWT=…        # pnpm service:jwt — dev only; in a deployment
                                # use ENGENTY_AI_SERVICE_SECRET instead. The
                                # credential needs `core.users.impersonate`,
                                # which is what actor-token minting checks.
                                # See ./service-identity.md
# Slack (can be the same Slack app as the team-chat bridge — add a bot token):
SLACK_BOT_TOKEN=xoxb-…
SLACK_SIGNING_SECRET=…
# Telegram (optional second platform):
TELEGRAM_BOT_TOKEN=…            # from @BotFather
```

Then create a binding in **Settings → Remote channels** (platform + unmapped
sender policy). Webhook endpoints — on the **gateway origin** (apps/core), which
proxies `/ai/*` to apps/ai; apps/ai is never exposed directly:

```
POST /ai/api/agents/engenty.remote/channels/slack/webhook
POST /ai/api/agents/engenty.remote/channels/telegram/webhook
```

Slack: point the app's **Event Subscriptions** at the webhook on the gateway
host (e.g. `npx cloudflared tunnel` to the core gateway, port 8787 in dev),
subscribe to `app_mention` + `message.im`, scopes `app_mentions:read`,
`im:history`, `chat:write`, `users:read`. Telegram: `setWebhook` to the
telegram path on the same origin.

## Testing without a Slack workspace

`SLACK_API_URL` (dev/E2E only) points the Slack adapter at a stub Web API so a
full turn — webhook → identity gate → thread provisioning → model turn →
streamed reply — runs without a real workspace. Sign synthetic events with
your `SLACK_SIGNING_SECRET` (`v0:` HMAC). This is how the runtime is
regression-tested end-to-end below the network edge; only Slack-side config
(event subscriptions, real payload quirks) needs the real-workspace E2E.

## Real-workspace E2E runbook

1. Slack app: **Event Subscriptions** → Request URL = the gateway origin +
   `/ai/api/agents/engenty.remote/channels/slack/webhook` (tunnel to core,
   port 8787 in dev); subscribe `app_mention` + `message.im`; **Interactivity**
   → same URL (approval buttons); scopes `app_mentions:read`, `im:history`,
   `chat:write`, `users:read`.
2. Set `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` (Setup UI or env). Unset
   `SLACK_API_URL`.
3. Binding in **Settings → Remote channels** — set `external_workspace_id` to
   the Slack `team_id` (anchor-first routing).
4. DM the bot as an unmapped sender → pairing link → claim → DM again →
   reply must arrive; verify the message pair in `ai.thread_message` under the
   tenant.
5. Ask the agent to run an approval-gated tool → Approve/Deny card in the
   thread → click → run resumes.
6. `remote_notify` toward the DM thread succeeds; toward a foreign thread id
   errors ("unknown thread for this tenant").

## Deploy notes

- `module_remote` is exposed to PostgREST automatically in local dev
  (schema sync derives it from migrations); **prod cloud Supabase needs the
  manual exposed-schemas PATCH** like every new module schema.
- The module is pro-only (`CLOSED_PREFIXES`).

### First prod enablement checklist

1. PostgREST exposed-schemas PATCH for `module_remote` (as for every module schema).
2. Platform credentials (`SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` /
   `TELEGRAM_BOT_TOKEN`) via Setup UI or deploy env — their presence IS the
   enablement signal; `ENGENTY_REMOTE_CHANNELS_ENABLED=false` is the kill switch.
3. Service principal holds `core.users.impersonate` (actor-token minting).
4. Slack app request URLs point at the prod gateway origin (never apps/ai directly).

## Roadmap

Multi-tenant credential store (EngentyChannelProvider + connections-framework
installations, Slack multi-workspace OAuth), WhatsApp/Teams adapters,
attachments + voice notes, per-binding capability ceilings (column exists,
enforcement pending), and Tier-B satellite env-mode remain — see the
engenty-remote plan.
