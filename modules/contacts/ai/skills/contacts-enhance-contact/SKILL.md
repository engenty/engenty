---
name: contacts-enhance-contact
title: Enhance contact
description: Enrich a stored organisation contact from public sources and summarize field suggestions for review.
allowed-tools: engenty_tools_search engenty_tool_execute web_search proposeUpdates
---

# Contacts Enhance Contact

Use this skill when enriching an existing organisation contact from public data.

## Step By Step

1. Use `scope.entityId` as the target contact when it is present. Only ask for an explicit id when there is no scoped contact or the user names a different record.
2. Load the current contact with `contacts_get` through `engenty_tool_execute`.
3. Check the required company, address, legal, and tax field groups with the allowed public-source tools.
4. Prefer official and first-party evidence over broader web results.
5. If evidence conflicts, prefer the source that is clearly newer. When that is not clear, ask the user to choose instead of guessing — one choice per candidate value via `requestDecision` when your tools include it, plain prose otherwise. Never invent a tool for this.
6. When you have one or more concrete field suggestions, call `proposeUpdates` with
   structured entries (schema-real `field`, proposed `value`, plus `source_url`,
   `evidence_snippet`, `confidence`, and `candidates` when relevant). This shows the
   user a field-level approval card. Do not just summarize in prose.
7. Changes are applied only when the user approves them on the card — they remain
   drafts until then.

## Tool calls

- `engenty_tools_search`
- `engenty_tool_execute`
- `web_search`
- `proposeUpdates`
