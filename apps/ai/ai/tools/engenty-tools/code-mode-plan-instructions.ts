// Plan-then-apply doctrine for Code Mode.
//
// A Code Mode program's return value is persisted into the thread and replayed
// on every subsequent turn. One real run returned an 88 KB project tree — every
// phase and task with ids — and pushed the following prompt to 116,596 tokens.
// The model was not misbehaving: writes were rejected inside the program, so
// returning everything it had read was its only way to hand the work forward.
//
// DELIBERATELY POLICY-AGNOSTIC: this text says nothing about whether writes are
// allowed inside a program, because that is being changed independently (gated
// writes that suspend for approval from a sandbox program). Both halves of the
// advice below hold either way — return a decision rather than a dataset, and
// batch writes instead of looping a single-item tool. Do not reintroduce
// "Code Mode is read-only" here; the dispatch layer states the current policy,
// and a stale claim in the prompt is worse than no claim.

export const CODE_MODE_PLAN_INSTRUCTIONS = `## Code Mode: return decisions, not datasets

Whatever an \`execute_typescript\` program returns is kept in the conversation and
re-sent on every later turn. Treat the return value as a **decision channel**,
not a way to carry data forward.

1. Read, join, filter and aggregate inside the program.
2. Return the smallest value that lets you act next — for a change, that is a
   **write plan**: the exact array of objects the write tool needs, and nothing
   else.
3. Apply it in ONE batched call.

Return a write plan, not the rows you read:

\`\`\`ts
const existing = await external_engenty_tool_execute_readonly({
  id: "projects_list_tasks",
  input: { project_id: projectId },
});
// ONLY what the write call needs — not the rows you read, not their ids,
// not timestamps, not fields you merely inspected.
return {
  tasks: missing.map((task) => ({
    discipline: task.discipline,
    hours: task.hours,
    phase_id: task.phaseId,
    title: task.title,
  })),
};
\`\`\`

Then apply it in a single call — e.g. \`manage_project_task\` with
\`action: "create_many"\` and the whole \`tasks\` array.

Rules:

- NEVER return whole records or full listings "so you can use them later". If you
  are returning the ids and titles of everything you read, you wanted a write
  plan instead.
- NEVER loop a single-item write tool over many items. Each iteration costs its
  own approval and its own round-trip; batched actions exist for this.
- If a write cannot proceed from inside the program, do NOT fall back to dumping
  what you read. Return the write plan and make the batched call outside.
- Program results are capped (~12 KB). An oversized result comes back truncated
  with a notice, and you will have to re-run something narrower — aggregate or
  select inside the program instead.
- If no batched write tool exists for what you need, say so and call the
  single-item tool deliberately, rather than looping it silently.`;
