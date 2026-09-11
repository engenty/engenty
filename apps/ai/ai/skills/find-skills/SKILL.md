---
name: find-skills
title: Find and install skills
description: Discover public agent skills, install them into the tenant catalog, and optionally mount them to a Space or agent.
allowed-tools: skills_find skills_install
---

# Find skills

Use this skill when the user wants **new** capabilities that are not already
available through the run's mounted `/skills` library — not when a local skill
already covers the job (`skill_search`).

Typical asks: "how do I do X", "find a skill for X", "is there a skill that
can…", "add a skill for …", "install a skill", or wishing they had help with a
domain (design, testing, deploy, reviews, …).

## Local vs public catalog

- **`skill_search` / `skill`** — skills already installed here (managed + custom).
- **This skill** — the public registry ([skills.sh](https://skills.sh/)). Never
  run `npx skills` or shell-install anything. Installation must go through
  `skills_find` / `skills_install` so the skill lands in **this tenant**, and
  optionally this **space** or **agent**.

## Workflow

### 1. Understand the need

Name the domain and the task (e.g. React performance, PR review, changelog).
Skip this skill when a local `skill_search` already returns a good match — use
that skill instead.

### 2. Search the public registry

Call **`skills_find`** with a specific query (two keywords beat one):

- "make my React app faster" → `react performance`
- "help with PR reviews" → `pr review`
- "I need a changelog" → `changelog`

The tool renders an **install card** in chat (same idea as the connections
connect card). Do **not** paste the result list as a markdown table — the card
is the answer. Add at most one or two sentences: a recommendation, or that
nothing matched.

Each hit is tagged `already_installed` / `already_in_space` / `already_preferred`
when it is already in the catalog, mounted on this space, or preferred on this
agent.

### 3. Let the user install from the card

The card installs into the tenant catalog and, when the checkboxes are on,
mounts the skill on **this space** and/or adds it as a **preferred skill** on
**this agent** (custom/database agents only — builtin agents discover via
`/skills`).

Tell them to click **Install** on the skill they want. Wait until they confirm
(or the card continues the thread).

Do **not** call `skills_install` until they clearly ask in text ("install the
first one", "add the PR review skill"). Then call **`skills_install`** with the
`provider` + `ref.id` from the search hit. Omit `space_id` / `agent_id` to use
the current run's space and agent; pass them only to override.

### 4. After install

1. Confirm the name that landed.
2. Load it with **`skill`** (exact name) and follow it for the original task.
3. If install failed because the caller cannot mount a space or edit an agent,
   the skill is still in the tenant catalog — they (or an admin) can attach it
   under Space settings → Skills or the agent form.

## When nothing matches

Say so, offer to do the task with general tools, and mention they can author a
skill later (`skill_propose` after a workflow has worked more than once).

## Rules

- Prefer a **local** skill over installing a duplicate.
- One install at a time unless the user asks for several.
- Never invent a registry slug or an `npx skills add …` command.
- Never ask for GitHub tokens or paste SKILL.md bodies into chat so the user
  can "save them somewhere".

## Starter prompts

- Find a skill for PR reviews.
- Is there a skill for React performance?
- Add a changelog skill to this space.
- Install a testing skill for this agent.
