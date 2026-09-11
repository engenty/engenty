---
name: simplify-code
description: Simplify recent changes without changing behaviour.
license: MIT
author: Hermes Agent (inspired by Claude Code /simplify), adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/simplify-code
---

# Simplify code

Clean up recent changes. Keep behaviour identical.

## When to Use

After a feature lands, before review, or when the user asks to simplify / dedupe / reduce cleverness.

## Procedure

1. Scope to the recent diff, not the whole codebase.
2. Remove dead code, redundant branches, and premature abstractions.
3. Prefer the obvious version over the "flexible" one nobody uses.
4. Keep tests green. If behaviour would change, stop and ask.
5. Do not spawn Hermes subagents or parallel review bots. Work the diff yourself (or load **requesting-code-review** after).

## Pitfalls

- "Simplifying" by rewriting architecture.
- Collapsing two concepts that only look similar.
- Touching files outside the change set.
