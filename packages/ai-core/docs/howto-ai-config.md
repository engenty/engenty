---
title: "AI config – models"
description: Environment variables, tenant ai.config JSON, and model selection for apps/ai AG-UI sessions.
---

# AI Config – Models

Product chat runs on **`apps/ai` AG-UI**. Model ids are resolved via `@engenty/ai-core` helpers and tenant `ai.config` JSON. Copilot identity and tone come from instruction documents in `modules/engenty-copilot/ai/agents/engenty.copilot/` (`AGENTS.md`, `SOUL.md`), assembled with `buildAgentLayeredPrompt`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_GATEWAY_API_KEY` | API key for the Vercel AI Gateway (required for copilot) | — |
| `OPENROUTER_API_KEY` | API key for OpenRouter, the optional second gateway | — |
| `AI_CHAT_MODEL` | Seeds the `model.medium` and `model.high` role bindings | `DEFAULT_AI_CHAT_MODEL_ID` |
| `AI_CLASSIFIER_MODEL` | Seeds `model.low` | Role default |
| `AI_ROUTING_MODEL` | Seeds `router` | Role default |
| `AI_SAFEGUARD_MODEL` | Seeds `safeguard` | Role default |
| `AI_PLANNING_CODING_MODEL` | Seeds `planning_coding` | Role default |
| `AI_RESEARCH_MODEL` | Seeds `research` | Role default |

These variables are **seed values, not runtime configuration**. They are read by
`seedBindings` (`config/model-roles.ts`) to populate `ai.model_binding` when that
table is empty; afterwards the binding rows are the source of truth and changing
an env var has no effect. Manage models in the bindings console instead.

Each role has exactly one env key. `AI_COORDINATOR_MODEL` and the other
legacy aliases were removed on 2026-08-04 along with the dead
`apps/core/src/lib/ai-config.ts` fallback chain this section used to describe
(nothing had imported it in a long time).

Runtime resolution for a chat model id is `resolveChatModelId`
(`@engenty/ai-core`): explicit override → tenant default → `DEFAULT_AI_CHAT_MODEL_ID`.

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
  `AI_*_MODEL` seeds, select values).
- Anything that means *which model* rather than *which model, where* — usage
  rows, pricing lookups, governance grants — takes `modelIdOfRef` first.

`resolveLanguageModel` (`apps/ai/src/model-gateways/resolve-language-model.ts`)
is the one place a ref becomes a callable model. A ref naming a gateway with no
credential throws rather than falling back, so a misconfiguration surfaces as
itself instead of as an "unknown model" from the wrong gateway.

## Tenant `ai.config` JSON (tenant-settings)

Stored under key `ai.config`. Parsed fields include:

- `chat_model_id`, `coordinator_model_id` (routing model; legacy JSON key) — copilot chat and supervisor/routing
- `routing_model_id` — optional alias read by parsers; persisted settings still use `coordinator_model_id`
- `classifier_model_id` — intended for fast single-shot classification (e.g. inbox document scan); default in UI is `openai/gpt-oss-20b`

Legacy keys such as `identity_prompt` / `soul_prompt` may still exist in stored JSON but are ignored by the API and UI.

## apps/ai session harness

The `apps/ai` session harness resolves tenant `ai.config` per run and passes resolved model ids into Mastra agent assembly. HTTP ingress should validate `AI_GATEWAY_API_KEY` exists (`readAiGatewayApiKeyFromEnv()` in `@engenty/ai-core`) before starting a run.

Typical resolution order:

1. Per-request override (if any)
2. Tenant `ai.config` (`chat_model_id`, `coordinator_model_id` / `routing_model_id`)
3. Environment variables (`AI_CHAT_MODEL`, `AI_ROUTING_MODEL`, `AI_COORDINATOR_MODEL`)
4. Package defaults (`DEFAULT_AI_CHAT_MODEL_ID`, etc.)

## Copilot instruction seeds

Default shared copilot content is loaded from markdown on disk in the engenty-copilot module:

- `engenty.copilot.agents` → `modules/engenty-copilot/ai/agents/engenty.copilot/AGENTS.md`
- `engenty.copilot.soul` → `modules/engenty-copilot/ai/agents/engenty.copilot/SOUL.md`

Prompt assembly uses `buildAgentLayeredPrompt` (`instructions/compose-agent-prompt.ts`). Public instruction keys: `ENGENTY_COPILOT_AGENTS_KEY`, `ENGENTY_COPILOT_SOUL_KEY` (`instructions/registry.ts`).
