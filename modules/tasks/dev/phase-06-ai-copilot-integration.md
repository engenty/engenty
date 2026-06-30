# Phase 6 — AI and copilot integration

**Status:** done  
**Depends on:** [phase-05-ui-hub.md](./phase-05-ui-hub.md)  
**Blocks:** [phase-07-projects-brutal-cutover.md](./phase-07-projects-brutal-cutover.md)

## Intent

Agents discover and work on tasks via catalog operations and skills. Copilot surfaces task context on `/module/tasks/*`.

---

## Tasks

### AI registration

- [x] `ai/registrar.ts` — register agent, skills, tools
- [x] Wire in `src/plugin.ts` via `registerAiRegistration`

### Agent: `tasks.assist`

```ts
// ai/agents/tasks-assist.ts
export const tasksAssistAgent: AgentDefinition = {
  module_id: "tasks",
  agent_type_key: "tasks-assist",
  chat: {
    route_keys: ["list", "detail", "briefing", "goals"],
  },
  // build_system_prompt: inject task_snapshot / goals_preview from scope
};
```

### Skill: task workflow

- [x] `ai/skills/task-workflow/SKILL.md`

Key rules (from Paperclip, adapted):

1. Always `tasks_checkout` before agent work
2. Never retry 409 — pick another task
3. Partial progress → `tasks_add_comment`, not fake status
4. `goal_id` required when creating tasks as agent
5. Release if wrong assignee

### Tools / operations (prefer operations)

Catalog runner uses registered operations — ensure these exist from Phase 2–4:

- `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`
- `tasks_checkout`, `tasks_release`, `tasks_add_comment`
- `goals_list`, `goals_get`

Optional thin tools in `ai/tools/` only if operation ergonomics insufficient.

### Copilot UI

- [x] `ui/copilot-contribution.ts` — matches `scope.current_module === "tasks"`
- [x] `ui/copilot-snapshot.ts` — `buildTaskSnapshot`, `buildGoalsPreview`
- [x] Detail/list pages call `setCopilotContext` with snake_case scope:

```ts
setCopilotContext({
  scope: {
    current_module: "tasks",
    entity_id: task.id,
    task_snapshot: buildTaskSnapshot(task),
    goal_id: task.goal_id,
  },
});
```

### Starter prompts

- "What should I work on next?"
- "Summarize blocked tasks linked to this goal"

---

## Code — agent heartbeat sketch

```ts
// Pseudocode for skill / automation consumer
const mine = await invokeOperation("tasks_list", {
  assignee_agent_type_key: "tasks-assist",
  status: ["todo", "in_progress", "blocked"],
});

const inProgress = mine.data.find((t) => t.status === "in_progress");
if (inProgress) {
  await continueWork(inProgress);
  return;
}

for (const task of mine.data.filter((t) => t.status === "todo")) {
  try {
    await invokeOperation("tasks_checkout", {
      task_id: task.id,
      agent_type_key: "tasks-assist",
      run_id: currentRunId,
      expected_statuses: ["todo", "backlog"],
    });
    await work(task);
    return;
  } catch (e) {
    if (e.code === "task_checkout_conflict") continue;
    throw e;
  }
}
```

---

## Exit criteria

- [x] Mastra/apps.ai catalog lists `tasks.*` operations
- [x] Copilot opens on task detail with snapshot (no extra tool call for "what is this task?")
- [ ] Manual: agent checkout → comment → complete in dev Studio
- [x] Contract tests pass
