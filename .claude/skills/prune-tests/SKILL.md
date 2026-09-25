---
name: prune-tests
description: Audit and clean up brittle, tautological, or change-detector tests in engenty-pro, one package or module per run — test outcomes, not functions; every surviving test must earn its place. Use when asked to prune, clean up, audit, or cut tests, or to review whether tests in a path are worth keeping.
---

# Prune tests

Recommend `DELETE` by default. Every test in scope — not only the suspect ones — earns survival by proving consequential behavior through a stable seam. Unit tests are allowed; they meet the same bar. Rewriting is an exception, not a compromise. A disposition alone does not authorize an edit.

## Outcome first

Test **outcomes**, not internal functions. An outcome is what a caller or user observes: an operation or route result, a service result, repo state after the call, a queue message, an emitted event, UI state after an interaction.

A test of an internal function (helper, predicate, mapper, formatter, domain rule) is redundant when breaking that function already fails an outcome test. Prove it with the **redundancy check** below — do not argue it.

A unit test survives only when an outcome test cannot reach the rule cheaply: many edge cases of one rule (cycle detection, date math, parsing), or a package whose exported function *is* the outcome for its callers.

## Governing rules

[`docs/agent/rules/testing-policy.mdc`](../../../docs/agent/rules/testing-policy.mdc) is the repo's test policy — read it first. This skill applies it to existing tests; it does not restate it. When the policy and this skill conflict, report the conflict instead of choosing whichever rule makes cleanup easier.

## Set the boundary

One package or module per run (e.g. `packages/ui-core`, `modules/tasks`, `apps/core/src/api`). The suite is ~1,500 files / 9,000+ cases — never the whole repo at once. Keep the boundary fixed and resolve the mode from existing authorization:

- **Audit:** Requests to inspect, find, review, or recommend are read-only. Report dispositions and evidence; do not delete or rewrite tests.
- **Cleanup:** Requests to prune, delete, rewrite, or implement approved dispositions authorize the corresponding scoped edits. Do not ask again for authorization already provided.

If a consequential scope decision remains unresolved, continue independent inspection and ask one focused question before affected edits. A skill invocation alone does not turn an audit into cleanup.

Classify individual tests, not whole files. During cleanup, remove a file only after every test in it has a disposition.

Suggested order by test volume: `apps/ai`, `apps/core`, `packages/ai-ui`, `modules/knowledge-base`, then the rest.

## The behavioral bar

Every test that survives — plain behavior tests included — must meet all of these:

1. It proves an exact behavior with an independent source: a bug commit, a rule in `docs/agent/`, a code comment explaining why the behavior matters, an accessibility rule, or a worked example. "The code currently does this" is not a source.
2. It detects a recognizable user-visible or caller-visible failure.
3. Its expected result is independent of the implementation.
4. It observes behavior through a public interface or stable seam.
5. It survives internal refactors and changes to incidental copy or layout.
6. It is not redundant: no outcome test already fails for the same break (see the redundancy check), and it does not duplicate nearby coverage.

## Seam map

| Behavior | Seam |
|---|---|
| Pure rule, transform, reducer | through the operation / service / hook that uses it; own unit test only for edge cases the outcome cannot reach cheaply |
| Package export used by other packages | unit test on the export — it is the outcome |
| Route, auth, tenant scoping | `app.request()` against the real app (see testing-policy) |
| SQL: constraints, RLS, cascades, grants | `*.integration.test.ts` or `pnpm check:leak-harness` / `check:rls-coverage` / `check:grants-coverage` |
| Whole feature (UI → API → DB) | `e2e/smoke/*.spec.ts` |
| Structural invariant (tool ids registered, schema exposed, imports allowed) | an existing `pnpm check:*` / `pnpm ai:check` script — not vitest |
| Component interaction contract | one component test via roles/labels |

A test at the wrong seam is `DELETE` when the right seam already covers it, `REWRITE` when it does not and the behavior passes the bar.

## What to prune

### Repo patterns — grep these first

| Pattern | Lead | Default |
|---|---|---|
| Class-string asserts | `className`, `toContain("text-`, `toMatch(/\bgap-/` | DELETE |
| Class/constant exports compared to themselves | `expect(fooClassName).toBe("…")` | DELETE |
| Pixel / geometry math | `paddingLeft`, `…Px(`, `style.` | DELETE |
| SQL "pin" source scans | `readFileSync(` on `supabase/migrations/**` | DELETE once live-DB coverage exists (see Conflicts) |
| Source / manifest scans | `readFileSync(` on `.ts`, `agent.json`, `package.json` | move to a `check:*` script or DELETE |
| Wiring tests over mocked internals | `*-wiring.test.ts`, `vi.mock("../…")` of sibling modules | DELETE unless the call is the contract |
| Call-shape asserts | `toHaveBeenCalledWith` on internal collaborators | DELETE (allowed cases are in testing-policy) |
| Registry / manifest counts | `toHaveLength(<n>)` on tools, routes, presets, exports | DELETE unless the count is the rule |
| Prose copied from the implementation | tool descriptions, prompts, log messages | DELETE |
| "Renders what it was given" | `getByText(<prop>)).toBeTruthy()` with no interaction | DELETE |
| Oversized route files (1,000+ lines) | many cases per endpoint | keep one case per status / auth outcome |

Regex matches are leads, not verdicts — read each test with the production interface.

### Tautologies

A tautological test derives the expected value by restating the production calculation, asserting a declaration against itself, or confirming that a stub returns the value the test arranged. It passes by construction because the expected and actual results share the same source. Guards that can never fail belong here too (e.g. asserting a runtime string contains no `${`).

An expected value must be able to disagree with the implementation. Use an independently known result when a real behavior deserves coverage. Otherwise recommend deletion.

### Change detectors

A change-detector test fails when code or presentation changes, without identifying a behavior that became wrong. Common forms include:

- source scans for imports, identifiers, files, or declarations
- counts of wrappers, elements, routes, exports, or inventory rows
- snapshots of generated markup, component trees, class strings, or other implementation structure
- assertions about private collaborators or incidental call shape
- duplicated assertions whose only added value is noticing that something changed

Recommend deleting these tests. If a real contract is hidden inside one, recommend the smallest behavioral replacement at the right seam.

### Geometry and appearance

Treat dimensions, ratios, coordinates, computed styles, layout-specific classes, mounted-row counts, render order, and generic overflow measurements as appearance evidence, not automated behavior. Visual review is manual; the repo has no visual-regression suite.

A viewport may set desktop or mobile context for a behavioral test. The assertion must complete a concrete user task.

### Copy

Use roles, accessible names, and labels to find and operate controls. Assert exact prose only when the wording itself is a requirement. Tests must pass in both `en` and `de` where the dev tenant may run either (smoke uses `t()`/`tLoose()`). Do not repeat a selector's accessible name as a content assertion.

### Focus and disabled state

Keep focus and disabled-state coverage only when that state is the interaction contract (focus moves to the first invalid field, focus restored after a dialog closes, Save enabled only after a semantic edit). Cover normalization matrices in pure unit tests; keep one representative component test. Delete assertions that merely confirm a rendered prop.

## Decide each candidate

Assign one disposition:

- `DELETE` when the test violates this policy and no behavior would become meaningfully unprotected.
- `REWRITE` when an unacceptable test contains a behavior that passes the bar.
- `KEEP` when a suspicious test proves acceptable behavior without changes.

`KEEP` and `REWRITE` need a justification naming the source (bar item 1), the failure it catches (item 2), and why it is not redundant (item 6). One line may cover a group of tests on the same rule. If you cannot name all three, `DELETE`.

### Redundancy check

For each file that tests an internal function:

1. Break the function where the tested decision lives (flip a condition, drop a case, return early). One mutation per decision the file claims to pin.
2. Run the scope's suite **without** that file: `pnpm vitest run --exclude <file>`.
3. Another test fails → the file is redundant → `DELETE`.
4. Nothing fails → the decision is unprotected at the outcome level. If it matters, `REWRITE` it as an outcome test (or `KEEP` the unit test when the edge cases justify it); if a break would be visible and harmless (display text, formatting), `DELETE`.
5. Restore the source exactly (`git checkout -- <file>`).

Record each mutation and its result in the report.

### Comments

Tests and their comments are not a scratch pad. In every surviving test and file header, remove dated notes, incident stories ("caught live on …"), commit hashes, TODOs and history ("used to", "before X we"). Keep at most a one- or two-line comment stating the durable reason the behavior matters, and only when the test name does not already say it.

When rewriting, keep only the setup, action, and assertions needed to prove the named behavior. Do not preserve the old test's size, assertion count, fixture shape, or test level.

## Apply authorized cleanup

1. Run the scope's tests first for a baseline: `pnpm --filter @engenty/<name> test` (or `pnpm vitest run` inside the package). Record files / tests.
2. Delete or rewrite the classified tests. Remove imports, fixtures, `test-helpers.ts` / `test-fixtures.ts` exports, and setup left unused. Do not change production code to preserve a test.
3. Run the redundancy check (above) for every internal-function test file before deciding it.
4. **Mutation check every `REWRITE`:** break the production behavior it names, confirm the test fails, restore the file exactly (`git diff` on the source must be empty).
5. If a package ends with zero test files, remove its `test` script — `pnpm check:test-wiring` and vitest both fail otherwise.
6. Validate: scope tests, `pnpm fix`, `pnpm --filter @engenty/<name> typecheck`, `pnpm check:test-wiring`.
7. Inspect the final diff: only test files and dead test support.

## Commit

- One commit per batch (one package/module). Never mix **open** and **closed** paths (`apps/manage`, closed modules) — run the path test from `/code/engenty/AGENTS.md`.
- Message: `test(<scope>): prune change-detector and tautological tests`, body with before → after files / tests / lines.
- Do not push without explicit user approval.

## Conflicts to report, not resolve

- **SQL pin tests** (tests that read migration SQL as text) guard declarations, not behavior. Replace them with a `*.integration.test.ts` that proves the same invariants on a local database — seeding, triggers, constraints, RLS through a signed user token, grants — and mutation-check it by breaking the database rule (disable the trigger, loosen the policy, drop the constraint) and restoring it. Then delete the pins. Integration tests skip without a database; that is accepted (example: `apps/core/src/dal/spaces.integration.test.ts`).
- Tests whose header comment argues for their existence: weigh the argument against the bar; report disagreement instead of silently deleting.

## Report

Audit recommendation or completed cleanup — say which. Then:

- before → after: files, tests, lines
- a table per file: test name, disposition, one-line reason
- `KEEP` / `REWRITE` justifications (source + failure caught)
- redundancy-check and mutation-check results (mutation → which test failed, or none)
- commands run and results; any failed gate or policy conflict
