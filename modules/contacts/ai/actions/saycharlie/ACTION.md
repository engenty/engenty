---
id: contacts.saycharlie
agent_id: contacts.manager
name: Say Charlie (dev test)
description: Dev-only test action — reply with a fixed phrase (AGENTS.md-style instruction).
default_thread_mode: new
input_schema_json:
  description: Dev-only action; no structured input (use an empty object).
  type: object
  additionalProperties: false
---

# Say Charlie

Say: I am Charlie

Your entire reply to the user must be exactly the sentence **I am Charlie** (same spelling and capitalization). Do not call tools. If the user message after the slash command adds extra text, still output only that sentence.
