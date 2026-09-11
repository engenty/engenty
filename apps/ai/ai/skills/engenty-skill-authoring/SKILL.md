---
name: engenty-skill-authoring
title: Engenty skill authoring
description: Author, improve, and test SKILL.md playbooks for Engenty's three roots.
license: MIT
author: Engenty (loop adapted from Anthropic skill-creator, Apache-2.0; roots from Hermes)
allowed-tools: skill_search skill
metadata:
  engenty:
    origin: anthropics/skills skills/skill-creator; hermes-agent skills/software-development/hermes-agent-skill-authoring
---

# Engenty skill authoring

Use this skill when adding or editing a playbook in this repo — including
"turn this workflow into a skill" and "why didn't it trigger?"

Discovery here is `skill_search` → `skill`, not a prompt index. Do not import
third-party skill eval harnesses or numeric scoring dashboards.

## Three roots

| Kind | Path | `source` on seed | Visible to `skill_search` when |
|---|---|---|---|
| Runtime | `apps/ai/ai/skills/<name>/` | `builtin` | Always on a resolved run (keep this set small). |
| Product | `modules/<id>/ai/skills/<name>/` | `<moduleId>` | That module is Space-mounted. |
| Library | `packages/ai-skills/ai/skills/<category>/<name>/` | `library` | Explicit Space skill mount or a category pack. |

`name` is globally unique. Tenant storage is a folder:
`managed/<name>/SKILL.md` plus optional siblings (`references/`, `scripts/`,
fonts). Library seed copies those files; `skill_search` still matches the
description, then `skill` loads the body.

Do not put playbooks in `@engenty/ai-core`. Do not inline bodies into AGENTS.md.
Do not seed a second skill that overlaps an existing name — harvest instead.

## Procedure

1. **Capture intent** from this conversation first: tools used, order, corrections,
   output shape. Confirm with the user before writing files.
2. **Choose a root** from the table. Library needs a category folder
   (`productivity`, `software-development`, `research`).
3. **Draft** `SKILL.md` (frontmatter + When to Use, Procedure, Pitfalls).
   Imperative voice. Explain *why*, not only MUST/NEVER. Keep the body lean;
   put long reference material in `references/` and say when to open it.
4. **Description** (≤ ~60–80 characters, what it does + when to load it).
   `skill_search` matches this text — include the domain words a user would
   type. Do not dump the catalog into the system prompt to “help triggering.”
5. **Smoke-test** with 2–3 realistic user prompts. Check that `skill_search`
   would find the name, then that following the procedure uses Engenty tools
   only. Subjective skills (tone, design) need a human glance, not fake
   numeric evals.
6. **Iterate**: generalize from failures; delete instructions that do not
   pull their weight. If every test reinvented the same script, that script
   belongs in `scripts/` only if this runtime will actually ship it.
7. Library skills: add a `packages/ai-skills/NOTICE.md` row. Distinct upstream
   license: bundle `LICENSE.txt`.

## Frontmatter

```yaml
---
name: my-skill
description: One sentence, under eighty characters, including when to use it.
license: MIT
author: Name, adapted for Engenty
allowed-tools: skill_search skill
metadata:
  engenty:
    category: software-development   # library only
    origin: hermes-agent skills/software-development/plan  # adapted skills
---
```

## Space install

Mount `{ resource_type: "skill", resource_key: "<name>" }`. A category pack
expands to those rows (`PUT /api/spaces/:id/skill-packs/:category`).

## Pitfalls

- Copying Hermes `skill_view` / `.hermes/` or third-party eval dashboards
  into the body.
- A second skill for a job an existing module skill already covers.
- Descriptions so vague `skill_search` never hits, or so long they belong in
  the body.
