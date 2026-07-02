# File-based agents — Mastra's new convention vs. ours

Status: WIP · 2026-07-02 · basis: `@mastra/core` 1.48.0 fs-routing (BETA, new in 1.48)

## The two conventions side by side

Engenty already ships a file convention (`defineModuleAi`, Phase 5), which predates
Mastra's:

| Aspect | Engenty (`modules/<m>/ai/`) | Mastra (`src/mastra/agents/<name>/`) |
|---|---|---|
| Agent identity | `agents/<id>/agent.json` (data) | `config.ts` (code, `agentConfig({...})`) |
| Instructions | `AGENTS.md` + optional `SOUL.md` | `instructions.md` |
| Skills | `skills/<name>/SKILL.md` | `skills/` — TS `createSkill()`, packaged `SKILL.md`, or flat `.md` |
| Tools | tool **ids** referencing the catalog | `tools/*.ts` — inline `createTool()` code |
| Actions / Routines | `ACTION.md` / `ROUTINE.md` | — (no equivalent) |
| Sub-agents | declared in config (`subAgents`) | `subagents/<id>/` dirs, one level |
| Memory / workspace | app-level presets, tenant-aware | `memory.ts` / `workspace.ts` per agent, default Local FS+sandbox |
| Model | resolved by purpose (`resolveChatModelId`) | `model` required, literal |
| Tenancy / dynamic seeds | yes (capability channel, per-tenant) | no (build-time; host-driven scan possible) |
| Discovery | our registrar at boot | `mastra dev/build` codegen — **or** host-driven: `assembleAgentFromFsEntry` is a public, pure (no-fs) function |

## Verdict: KEEP ours — it's a superset where it matters

Mastra's convention targets standalone Mastra projects: code-first tools, literal
models, no actions/routines, no tenancy, one-level subagents. Migrating would mean
giving up exactly the parts that make engenty modules work (catalog-referenced tools
with contracts/approval metadata, ACTION/ROUTINE capabilities, purpose-based model
resolution, per-tenant capability seeds). There is no interop pressure either — both
end in a plain `Agent`.

Two things are worth taking anyway:

1. **The assembly seam.** `assembleAgentFromFsEntry(entry, {onWarn})` does zero
   filesystem I/O — the CLI is only a scanner. That confirms our host-driven registrar
   approach is the supported embedding model (the changelog says so explicitly), and
   it means we *could* delegate the merge/precedence mechanics (instructions
   precedence, tool/skill collision handling, default workspace injection) to Mastra
   instead of hand-rolling them in `assembleDynamicAgent` — worth evaluating when we
   next touch agent assembly, not as its own project.
2. **`createSkill` / `InlineSkill`** as the internal representation for our
   `SKILL.md` scan — aligns us with where Mastra is standardizing skills (incl.
   `references/` inlining) at near-zero cost.

## Watch items

- BETA: layout and precedence rules may change without a major bump.
- The one place convergence could become attractive: if Mastra Studio / editor
  tooling grows around the fs convention (visual agent editing over these
  directories), mapping `agent.json + AGENTS.md` → `FsAgentEntry` is a ~day-sized
  adapter, not a rewrite. Keep that door open by not diverging further than we
  already have.
