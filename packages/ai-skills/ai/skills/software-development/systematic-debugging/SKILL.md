---
name: systematic-debugging
description: Find root cause before changing production code.
license: MIT
author: Hermes Agent (adapted from obra/superpowers), adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/systematic-debugging
---

# Systematic debugging

Understand the bug before fixing it.

## When to Use

Unexpected failures, regressions, "it used to work", flaky tests, or a proposed patch that does not explain the cause.

## Procedure

1. **Observe** — reproduce with a concrete failing case. Capture the actual error, not a paraphrase.
2. **Locate** — read the failing path. Add a focused failing test when you can.
3. **Hypothesize** — list 1–3 causes that would produce *this* symptom. Disprove them with evidence.
4. **Fix** — smallest change that addresses the root cause. Re-run the failing case.
5. **Guard** — leave a test or check so the bug cannot return silently.

Use sandbox/workspace commands for logs and tests. Do not spray unrelated refactors into the fix.

## Pitfalls

- Patching a symptom ("add a null check") without knowing why it was null.
- Restarting from a different theory every time a guess fails.
- Shipping a fix with no reproduction you can re-run.
