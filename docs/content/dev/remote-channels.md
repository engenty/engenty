---
title: Remote channels
description: External messengers (Slack, Telegram, …) as chat interfaces to engenty agents via Mastra AgentChannels — the engenty-remote module and the apps/ai channel runtime.
---

# Remote channels (engenty-remote)

External messengers become chat interfaces to engenty agents. A message to the
bot (Slack DM or @-mention) runs the chat-tuned **`engenty.remote`** agent —
full tool catalog, short answers, deep links instead of rich UI — and the reply
posts back natively on the platform.

Built on Mastra's `channels` layer (`@mastra/core/channels`), which embeds
Vercel's Chat SDK (`chat` + `@chat-adapter/*`): webhook signature verification,
platform thread ↔ agent thread mapping, typing status, streamed post+edit
replies, and tool-display rendering all come from that pipeline.

## Architecture (Phase 1)

- **`modules/engenty-remote`** — the module: `engenty.remote` agent definition
  (AGENTS.md carries the brevity contract), `module_remote` schema (bindings,
  identities, conversations, inbound dedup — used from Phase 2 on).
- **`apps/ai/src/api/remote-channels.ts`** — the channel runtime: builds a
  persistent channel-bound Agent from the module's config, registers it on the
  Mastra instance (which initializes `AgentChannels`), and mounts the generated
  webhook routes on the apps/ai Hono app.
- **Scope** — every inbound platform event wraps Mastra's default handler in
  the engenty-tools ALS scope (same seam as `delegate-run.ts`). Phase 1 runs as
  the AI service principal (`ENGENTY_AI_SERVICE_JWT`), single-tenant, with
  `approvalPolicy: "deny"` for gated operations. Phase 2 replaces this with the
  per-sender identity gate (pairing + delegated actor token).

## Enabling (dev, single workspace)

Opt-in via environment — all four are required:

```bash
ENGENTY_REMOTE_CHANNELS_ENABLED=true
ENGENTY_AI_SERVICE_JWT=…        # pnpm service:jwt
SLACK_BOT_TOKEN=xoxb-…          # Slack app bot token
SLACK_SIGNING_SECRET=…          # Slack app signing secret
```

Webhook endpoint (mounted under the /ai base path):

```
POST /ai/api/agents/engenty.remote/channels/slack/webhook
```

Point the Slack app's **Event Subscriptions** at it (e.g. via
`npx cloudflared tunnel`), subscribe to `app_mention` + `message.im`, and give
the bot `app_mentions:read`, `im:history`, `chat:write`, `users:read`.

## Roadmap

Multi-tenant bindings (EngentyChannelProvider + connections-framework
installation store), identity pairing, approval cards, and more platforms are
specced in the engenty-remote plan. The env-credential mode above stays the
right fit for single-tenant satellite installs.
