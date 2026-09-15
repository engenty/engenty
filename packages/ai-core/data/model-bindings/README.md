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
  "roles": { "model.low": "…", "router": "…" }
}
```

`roles` must cover every platform role in `AI_PLATFORM_ROLES`.

## Policy

| Job | Pick |
|-----|------|
| **Router / classifier / safeguard** | Free or open-weight models when the gateway has them (`:free` on OpenRouter, `gpt-oss-*` on Vercel). These jobs are short and must stay cheap. |
| **Chat (`model.low` / `medium` / `high`)** | The cheapest model that can actually run an agent turn (tools). Not `gpt-oss-20b` — too weak for product chat. |
| **Planning & memory** | A chat-tier model known to finish structured output / workspace tools. |

Wizard order when more than one key is set: Vercel → OpenRouter → Opper → OpenAI → Anthropic.

Saving a key in the first-run wizard rebases the table **only while it still
matches a shipped pack**. A role someone rebound in the console is left alone.
