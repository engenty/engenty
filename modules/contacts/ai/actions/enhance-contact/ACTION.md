---
id: contacts.enhance-contact
agent_id: contacts.manager
name: Enhance contact from public sources
description: Research missing or divergent organisation fields from public sources and summarize suggestions for user review.
default_thread_mode: new
skills: contacts-enhance-contact
allowed-tools: engenty_tools_search engenty_tool_execute web_search proposeUpdates
input_schema_json:
  description: Optional explicit contact id when the run is not already scoped to a contact.
  type: object
  additionalProperties: false
  properties:
    id:
      description: Organisation contact id to load and enhance.
      type: string
      minLength: 1
---

# Enhance Contact From Public Sources

## Task

Enhance one existing organisation contact by researching missing or divergent fields from public sources, then summarize field suggestions for user review.

## Steps

1. Resolve the target contact from scope. If `scope.entityId` exists, use it and do not ask the user to repeat the id.
2. Fetch the current contact with `contacts_get` through `engenty_tool_execute` (use `engenty_tools_search` first when the read surface is unclear).
3. Check all required field groups and use only the allowed tools for this action.
4. When two or more evidence checks are independent, you may gather them in parallel through shared runtime helpers, but keep the same source-priority and ambiguity rules.
5. Prefer official or first-party evidence over broad web results.
6. When sources diverge, prefer the source that is clearly newer if that is evident from the evidence. Otherwise ask the user to choose instead of guessing.
7. Convert changed or missing values into structured field suggestions (schema-real
   `field` name, proposed `value`, and `source_url` + `evidence_snippet` +
   `confidence` when available).
8. When you have one or more concrete suggestions, call `proposeUpdates` with them
   so the user gets a field-level approval card. Do NOT just describe them in prose;
   the approval card is how the user reviews and applies changes.
9. If there is genuine ambiguity for a field, include `candidates` so the user can
   pick. Use a short closing line; the approval card carries the detail.

## Rules

- Operate on exactly one contact in this action.
- This action is for organisation enrichment; do not use it for person-only records.
- Use only the allowed tools declared in the action harness.
- Do not mutate contacts directly in this action.
- If ambiguity remains after checking source quality, ask the user to choose.
- Do not forget a field group just because one source was incomplete; continue with the other allowed tools.
- Use schema-real field names. In the current contacts schema, the additional address field is `address_info`, not `address_street_additional`.
