---
title: "AI config – models"
description: Role bindings, tenant ai.config JSON, and model selection for apps/ai AG-UI sessions.
---

# AI Config – Models

Product chat runs on **`apps/ai` AG-UI**. Model ids are resolved via `@engenty/ai-core` helpers and tenant `ai.config` JSON. Copilot identity and tone come from instruction documents in `modules/engenty-copilot/ai/agents/engenty.copilot/` (`AGENTS.md`, `SOUL.md`), assembled with `buildAgentLayeredPrompt`.

## Where models come from

| Variable | Description |
|----------|-------------|
| `AI_GATEWAY_API_KEY` | API key for the Vercel AI Gateway (required for copilot) |
| `OPENROUTER_API_KEY` | API key for OpenRouter, the optional second gateway |

There are **no model env vars and no package default model**. Every model
comes from a **role binding** (`ai.model_binding`), edited in manage → Role
bindings. Roles: `model.low` / `model.medium` / `model.high` (graded agent
tiers), `classifier` (pick-one-of-N), `fast_text` (short prose without tools),
`image`, `embedding`, `video`, `realtime`. An unbound role throws
(`ModelRoleNotBoundError`) instead of falling back.

Seeds, applied only to an empty table:

- `apps/ai/config/default-models.json` — committed bindings (per role:
  `gateway` + `model_id`), manage → Role bindings → Export
- `apps/ai/config/available-models.json` — activated catalog + pricing,
  manage → AI models → Export
- `packages/ai-core/data/model-bindings/<gateway>.json` — per-gateway packs for
  a first boot, picked by the gateway whose key was connected

Runtime resolution (`resolvePurposeModel` / `resolveChatModelId`,
`@engenty/ai-core`): session override → agent override → tenant `ai.config` →
role binding. The browser cannot resolve a binding — it reads the effective
model from `GET /ai/v1/settings/effective`.

## Model refs: naming a gateway in a single string

Every layer above stores one string, so a model is named by a **ref**:
`<gateway>:<model id>`, with a bare id meaning the default gateway (`vercel`).
`openai/gpt-4o` and `vercel:openai/gpt-4o` are the same model, which is why no
stored value needed migrating when OpenRouter was added.

- `parseModelRef` / `formatModelRef` / `modelIdOfRef` (`config/model-ref.ts`).
- The head is matched against the **registered gateway set**, never just split
  on the first colon — OpenRouter's own ids carry colons
  (`meta-llama/llama-3.1-8b-instruct:free`).
- `ai.model_binding` keeps the pair in two columns; the ref exists for the
  single-string surfaces (tenant JSON, agent `modelOverride`, session picks,
  select values).
- Anything that means *which model* rather than *which model, where* — usage
  rows, pricing lookups, governance grants — takes `modelIdOfRef` first.

`resolveLanguageModel` (`apps/ai/src/model-gateways/resolve-language-model.ts`)
is the one place a ref becomes a callable model. A ref naming a gateway with no
credential throws rather than falling back, so a misconfiguration surfaces as
itself instead of as an "unknown model" from the wrong gateway.

## Tenant `ai.config` JSON (tenant-settings)

Stored under key `ai.config`. Parsed fields include:

- `chat_model_id` — chat agents (copilot, supervisors, specialists) when no effort tier applies
- `classifier_model_id` — pick-one-of-N questions (effort routing, inbox lanes, guardrails)
- `fast_text_model_id` — short prose without tools (titles, summaries, observational memory)

Legacy keys such as `identity_prompt` / `soul_prompt` may still exist in stored JSON but are ignored by the API and UI.

## apps/ai session harness

The `apps/ai` session harness resolves tenant `ai.config` per run and passes resolved model ids into Mastra agent assembly. HTTP ingress should validate `AI_GATEWAY_API_KEY` exists (`readAiGatewayApiKeyFromEnv()` in `@engenty/ai-core`) before starting a run.

Typical resolution order:

1. Per-request override (if any)
2. Tenant `ai.config` (`chat_model_id`, `classifier_model_id`, `fast_text_model_id`)
3. Role bindings (`ai.model_binding`) — no further fallback

## Copilot instruction seeds

Default shared copilot content is loaded from markdown on disk in the engenty-copilot module:

- `engenty.copilot.agents` → `modules/engenty-copilot/ai/agents/engenty.copilot/AGENTS.md`
- `engenty.copilot.soul` → `modules/engenty-copilot/ai/agents/engenty.copilot/SOUL.md`

Prompt assembly uses `buildAgentLayeredPrompt` (`instructions/compose-agent-prompt.ts`). Public instruction keys: `ENGENTY_COPILOT_AGENTS_KEY`, `ENGENTY_COPILOT_SOUL_KEY` (`instructions/registry.ts`).
