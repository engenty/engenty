---
name: test-driven-development
description: "TDD: failing test first, then minimal code."
license: MIT
author: Hermes Agent (adapted from obra/superpowers), adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command
metadata:
  engenty:
    category: software-development
    origin: hermes-agent skills/software-development/test-driven-development
---

# Test-driven development

Write the test first. Watch it fail. Write the smallest change that passes.

## When to Use

New behaviour, bug fixes, and refactors. Ask before skipping for throwaway prototypes or generated code.

## Procedure

1. **RED** — add one failing test that names the behaviour. Run it. Confirm it fails for the right reason.
2. **GREEN** — change production code only enough to pass. No extra features.
3. **REFACTOR** — tidy with tests still green.

Use the workspace sandbox (`mastra_workspace_execute_command`) when you need to run tests. Do not assume pytest, a particular layout, or Hermes CLIs. Discover the project's real test command from the repo.

If you already wrote production code: delete it and start from the failing test.

## Pitfalls

- Writing tests that mirror implementation instead of behaviour.
- Skipping the red run "because it would obviously fail".
- Assuming a Python/pytest tree in an Engenty TypeScript workspace.
