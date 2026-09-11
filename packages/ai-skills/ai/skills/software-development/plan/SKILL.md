---
name: plan
description: Write an implementation plan; do not execute it.
license: MIT
author: Hermes Agent (writing-craft adapted from obra/superpowers), adapted for Engenty
allowed-tools: skill_search skill
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/plan
---

# Plan

Use this skill when the user wants a plan instead of implementation.

## When to Use

- Multi-step features, migrations, or unclear scope.
- Before delegating implementation.
- The user says "plan", "don't code yet", or "how would we…".

## Procedure

1. Inspect with **read-only** tools. Do not edit product files. Do not run mutating commands.
2. If the request is genuinely underspecified, ask one clarifying question. Otherwise write the plan.
3. Save markdown under `/home/plans/` (or the Space files mount if that is the working tree). Filename: `YYYY-MM-DD_HHMMSS-<slug>.md`. Never `.hermes/plans/`.
4. Reply with the goal and the saved path.

## Plan contents

Include, when relevant: goal, current context, approach, step-by-step tasks, files likely to change, tests/validation, risks and open questions. For code work, name exact paths and how to verify.

A good plan makes implementation obvious. If the implementer has to guess, the plan is incomplete.

## Pitfalls

- Implementing "just a little" while planning.
- Saving next to the repo as `.hermes/` or a local-only path the user cannot open.
- Inventing APIs or file layouts you have not inspected.
