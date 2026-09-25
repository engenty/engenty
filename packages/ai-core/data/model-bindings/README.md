# Model-binding packs

Seed bindings for a **fresh install**, keyed by the gateway whose API key the
setup wizard (or env) just connected. Software loads the JSON. The binding
console stays the source of truth after that — these files are defaults, not
live configuration.

Same idea as commercial region packs (`modules/commercial-settings/data/`):
edit JSON here, not a table of string constants in TypeScript.

```text
data/model-bindings/
  README.md
  vercel.json
  openrouter.json
  opper.json
  openai.json
  anthropic.json
```

Each file:

```json
{
  "gateway": "openrouter",
  "label": "OpenRouter",
  "roles": { "model.low": "…", "classifier": "…" }
}
```

`roles` must cover every platform role in `AI_PLATFORM_ROLES`.

## Policy

| Role | Pick |
|------|------|
| **`model.low` / `model.medium` / `model.high`** | Graded agent tiers. The cheapest model that can actually run an agent turn (tools) at that grade. Not `gpt-oss-20b` — too weak for product chat. |
| **`classifier`** | Pick-one-of-N (effort routing, inbox lanes, guardrails). Jev (`typesafe-ai/jev`) — short, cheap choice calls. |
| **`fast_text`** | Short prose without tools (titles, summaries, memory). Small, cheap, large context. |
| **`image` / `embedding` / `video` / `realtime`** | Media roles. A ref (`vercel:…`) when the pack's gateway has no such model. |

These packs apply to a first boot only. The committed bindings for a reset DB
or a new server live in `apps/ai/config/default-models.json` (with
`available-models.json` for the activated catalog + pricing).

Wizard order when more than one key is set: Vercel → OpenRouter → Opper → OpenAI → Anthropic.

Saving a key in the first-run wizard rebases the table **only while it still
matches a shipped pack**. A role someone rebound in the console is left alone.
