---
id: contacts.research
agent_id: contacts.manager
name: Research contact
description: Research a contact or company using public and official sources.
default_thread_mode: new
skills: contacts-research
allowed-tools: engenty_tool_execute web_search
input_schema_json:
  description: Optional filters for a single-contact or company research run.
  type: object
  properties:
    id:
      description: Contact or company id to load before deeper research.
      type: string
      minLength: 1
    focus:
      description: Which research angles to prioritize (omit for a balanced default).
      type: array
      items:
        type: string
        enum:
          - overview
          - news
          - people
          - industry
---

# Research Contact

## Task

Research one contact or company and return factual background.

## Steps

1. Call `engenty_tool_execute` with `{ "operationId": "contacts_get", "input": { "id": "<contact-id>" } }` when the workflow is scoped to a contact (`id` is provided in the action input).
2. For company and Austrian organisation research, use `web_search` with the most specific known identifiers (company name, legal name, VAT/UID id, website URL) to find official registry, impressum, and first-party legal pages. Use `engenty_tool_execute` for any stored Contacts operation or registered route that surfaces additional company data.
3. Use `web_search` for broader context such as news, leadership, industry background, or to inspect likely first-party legal pages from the company website.
4. Return a concise summary that clearly separates verified facts from broad contextual findings.

## Rules

- Research exactly one target in this action.
- Prefer official and first-party sources.
- Do not publish suggestions or mutate records in this action.
