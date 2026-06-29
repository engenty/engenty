---
title: "AI config – models"
description: Environment variables, tenant ai.config JSON, and model selection for apps/ai AG-UI sessions.
---

# AI Config – Models

Product chat runs on **`apps/ai` AG-UI**. Model ids are resolved via `@engenty/ai-core` helpers and tenant `ai.config` JSON. Copilot identity and tone come from instruction documents in `modules/engenty-copilot/ai/agents/engenty.copilot/` (`AGENTS.md`, `SOUL.md`), assembled with `buildAgentLayeredPrompt`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_GATEWAY_API_KEY` | API key for AI Gateway (required for copilot) | — |
| `AI_CHAT_MODEL` | Model ID for chat/specialist | Package default from `DEFAULT_AI_CHAT_MODEL_ID` |
| `AI_COORDINATOR_MODEL` | Model ID for coordinator routing | Falls back to `AI_CHAT_MODEL`, then package default |

Runtime resolution is centralized in `resolveChatModelId` (`@engenty/ai-core`): override → optional `tenantDefault` → env chain above → `DEFAULT_AI_CHAT_MODEL_ID`.

## Tenant `ai.config` JSON (tenant-settings)

Stored under key `ai.config`. Parsed fields include:

- `chat_model_id`, `coordinator_model_id` — copilot chat and coordinator
- `classifier_model_id` — intended for fast single-shot classification (e.g. inbox document scan); default in UI is `openai/gpt-5-nano`

Legacy keys such as `identity_prompt` / `soul_prompt` may still exist in stored JSON but are ignored by the API and UI.

## apps/ai session harness

The `apps/ai` session harness resolves tenant `ai.config` per run and passes resolved model ids into Mastra agent assembly. HTTP ingress should validate `AI_GATEWAY_API_KEY` exists (`readAiGatewayApiKeyFromEnv()` in `@engenty/ai-core`) before starting a run.

Typical resolution order:

1. Per-request override (if any)
2. Tenant `ai.config` (`chat_model_id`, `coordinator_model_id`)
3. Environment variables (`AI_CHAT_MODEL`, `AI_COORDINATOR_MODEL`)
4. Package defaults (`DEFAULT_AI_CHAT_MODEL_ID`, etc.)

## Copilot instruction seeds

Default shared copilot content is loaded from markdown on disk in the engenty-copilot module:

- `engenty.copilot.agents` → `modules/engenty-copilot/ai/agents/engenty.copilot/AGENTS.md`
- `engenty.copilot.soul` → `modules/engenty-copilot/ai/agents/engenty.copilot/SOUL.md`

Prompt assembly uses `buildAgentLayeredPrompt` (`instructions/compose-agent-prompt.ts`). Public instruction keys: `ENGENTY_COPILOT_AGENTS_KEY`, `ENGENTY_COPILOT_SOUL_KEY` (`instructions/registry.ts`).
