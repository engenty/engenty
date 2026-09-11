---
name: spike
description: Run a throwaway experiment before committing.
license: MIT
author: Hermes Agent (adapted from gsd-build/get-shit-done), adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/spike
---

# Spike

A spike is a time-boxed experiment to learn, not to ship.

## When to Use

Unknown APIs, performance questions, "will this approach even work?", or choosing between two designs.

## Procedure

1. State the question and a time box (default: one focused pass).
2. Work in `/sandbox` or `/home/spikes/` — not in production modules.
3. Keep the experiment disposable. Do not "just merge it" because it compiled.
4. Capture the answer: what you tried, what worked, what to do next. Prefer `artifact_write` so the user can read it, or a markdown file under `/home/spikes/`.
5. Delete or leave the spike clearly marked throwaway.

## Pitfalls

- Polishing spike code as if it were the product.
- Skipping the written conclusion so the next session re-discovers the same dead end.
- Mixing spike edits into the real feature branch without saying so.
