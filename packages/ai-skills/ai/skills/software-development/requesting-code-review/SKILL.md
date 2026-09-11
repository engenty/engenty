---
name: requesting-code-review
description: Review local changes before calling them done.
license: MIT
author: Hermes Agent (adapted from obra/superpowers + MorAlekss), adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/requesting-code-review
---

# Requesting code review

Self-review the diff before you tell the user it is ready.

## When to Use

Before commit, before a PR, or when the user asks you to review your own (or a colleague's) change.

## Procedure

1. List the changed files and the intent of the change.
2. Check correctness: edge cases, error paths, auth/tenant/Space scope.
3. Check safety: secrets, injections, destructive operations, missing approvals.
4. Check quality: names, duplication, tests for the new behaviour.
5. Run the project's real quality gates when they exist (this repo: `pnpm fix`, then lint/typecheck/tests as appropriate). Do not invent Hermes or vendor CLI names.
6. Report findings as: blockers, should-fix, nits. Fix blockers before claiming done.

## Pitfalls

- Rubber-stamping because "the tests passed".
- Reviewing files you did not actually open.
- Auto-formatting the whole tree when the task was a one-line fix.
