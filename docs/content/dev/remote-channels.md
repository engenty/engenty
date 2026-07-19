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

## Proactive messages

The `remote_notify` gateway op (capability `module.engenty-remote.write`, also
callable by agents through the tool catalog) enqueues
`{ platform, external_thread_id, text }` onto the `remote_outbound` pgmq queue;
the apps/ai consumer delivers via the live Chat SDK (`chat.thread(id).post`).

## Enabling (dev)

Opt-in via environment — master switch + at least one platform:

```bash
ENGENTY_REMOTE_CHANNELS_ENABLED=true
ENGENTY_AI_SERVICE_JWT=…        # pnpm service:jwt
# Slack (can be the same Slack app as the team-chat bridge — add a bot token):
SLACK_BOT_TOKEN=xoxb-…
SLACK_SIGNING_SECRET=…
# Telegram (optional second platform):
TELEGRAM_BOT_TOKEN=…            # from @BotFather
```

Then create a binding in **Settings → Remote channels** (platform + unmapped
sender policy). Webhook endpoints (under the /ai base path):

```
POST /ai/api/agents/engenty.remote/channels/slack/webhook
POST /ai/api/agents/engenty.remote/channels/telegram/webhook
```

Slack: point the app's **Event Subscriptions** at the webhook (e.g. via
`npx cloudflared tunnel`), subscribe to `app_mention` + `message.im`, scopes
`app_mentions:read`, `im:history`, `chat:write`, `users:read`. Telegram:
`setWebhook` to the telegram path.

## Deploy notes

- `module_remote` is exposed to PostgREST automatically in local dev
  (schema sync derives it from migrations); **prod cloud Supabase needs the
  manual exposed-schemas PATCH** like every new module schema.
- The module is pro-only (`CLOSED_PREFIXES`).

## Roadmap

Multi-tenant credential store (EngentyChannelProvider + connections-framework
installations, Slack multi-workspace OAuth), WhatsApp/Teams adapters,
attachments + voice notes, per-binding capability ceilings (column exists,
enforcement pending), and Tier-B satellite env-mode remain — see the
engenty-remote plan.
