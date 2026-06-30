---
id: company-profile.research
agent_id: company-profile.manager
name: Company Profile Research
description: Research public sources and suggest company profile field updates as a bounded one-shot task.
default_thread_mode: new
allowed-tools: loadCompanyProfile companyWebsitePages web_search
input_schema_json:
  description: No structured fields; scope and tenant context drive which company profile to research.
  type: object
---

# Company Profile Research

## Task

Research the tenant company profile from public sources and summarize validated field suggestions for human review on the settings form.

## Steps

1. Call `loadCompanyProfile` first to read current stored values and the website URL if present.
2. When a public website exists, call `companyWebsitePages` only for real public hosts (skip localhost, `.local`, `.engenty.localhost`, staging placeholders, and internal-only URLs).
3. Use `web_search` for complementary evidence (official site, imprint, registry, contact pages, LinkedIn company page, etc.).
4. Summarize every validated suggestion in chat with evidence and `source_url` when possible.
5. Remind the user that suggestions are draft until they save the form.

## Rules

- Only suggest fields with clear evidence; include `source_url` when possible.
- Use snake_case keys from the editable field list in the agent prompt.
- Prefer official or primary sources over third-party directories.
- Do not suggest banking fields unless an official public source provides them.
- List multiple plausible values clearly when evidence conflicts.
- Never claim data was persisted without an explicit user save.
