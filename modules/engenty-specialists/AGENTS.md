# engenty-specialists — module contract notes

The code home of **hired engenties** (`kind === "specialist"`,
`source === "database"`): the catalog floor every one of them carries, the
Space playbooks it may load, and the standing appendix assembled into its
prompt. Same recipe as `engenty-copilot`: a builtin module used for code
organisation, not a runtime module.

- **Builtin, never mounted.** `apps/ai` imports this package directly
  (`@engenty/engenty-specialists/ai`). `src/plugin.ts` is a no-op
  `EngentyPluginFactory` — no operations, no UI, no schema, no env. Not on
  `defineModuleAi`: there is no `ai/registrar.ts`, so nothing here travels the
  module capability channel.
- **Skills are seeded by name, never mount-gated.** A floor skill must exist
  in every Space. `tenant-skills-seed.ts` has a dedicated loop for this
  module's `ai/skills/*/SKILL.md` (source `engenty-specialists`), the way it
  used to for the copilot's — never through the per-module capability seeds
  that `allowed-skills.ts` filters by mount.
- **Tools stay in `apps/ai/ai/tools/`.** The routine, look, self-revise,
  desk and propose verbs need stores and the run context; exactly like the
  copilot's tools they are built in apps/ai. This module holds what is pure
  over constants and markdown.
- **dist vs source.** apps/ai imports from `dist` (tsup); apps/core loads
  `src/plugin.ts` via jiti from source. `.md` files are bundled as text.
  Planning notes under `dev/` are outside the build graph.
- `pnpm ai:check` covers `ai/skills/*/SKILL.md` here like everywhere else.
