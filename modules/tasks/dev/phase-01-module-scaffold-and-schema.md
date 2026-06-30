# Phase 1 — module scaffold and schema

**Status:** done (2026-05) — checklist below retained for audit  
**Depends on:** [phase-00-baseline-and-contract-tests.md](./phase-00-baseline-and-contract-tests.md)  
**Blocks:** [phase-02-tasks-backend-api.md](./phase-02-tasks-backend-api.md)

## Intent

Bootstrap `@engenty/tasks` as a real module: manifest, plugin factory stub, Postgres schema, mandatory host declaration. **No projects changes.**

---

## Tasks

### Package & manifest

- [ ] Extend `package.json` with build/dev scripts (mirror `modules/projects`)
- [ ] Add `engenty.plugin.json`:

```json
{
  "id": "tasks",
  "name": "Tasks",
  "description": "Canonical goals and tasks for human and agent collaboration",
  "version": "0.0.1",
  "kind": "module",
  "provides": [
    "module.tasks",
    "module.tasks.read",
    "module.tasks.write",
    "module.goals.read",
    "module.goals.write",
    "platform.work",
    "ui.route.module.tasks"
  ],
  "capabilities": {
    "operations": true,
    "ai": true
  }
}
```

- [ ] Add `src/plugin.ts` — factory stub registering nothing until Phase 2
- [ ] Wire `@engenty/tasks` in `apps/ui/package.json`
- [ ] Regenerate `apps/ui/src/plugins/generated-catalog.ts`

### Mandatory core module

- [ ] Add to `apps/core/src/plugins/mandatory-plugins.ts`:

```ts
{
  pluginId: "tasks",
  capabilities: [
    "module.tasks",
    "platform.work",
  ],
  hostHealthRelevant: true,
  reason:
    "Tasks are the canonical work artefact for human and agent collaboration across Engenty modules.",
}
```

- [ ] Verify plugin admin API returns `mandatory: true` for `tasks`
- [ ] Document in `docs/dev/backend-abstraction.md` or tasks dev README

### Lift status builtins

- [ ] Copy `modules/projects/task-status-builtins.ts` → `modules/tasks/task-status-builtins.ts`
- [ ] Rename types: `ProjectTaskStatusDefinition` → `TaskStatusDefinition` in tasks schema (Phase 2)

### Migration — `module_tasks` schema

- [ ] `supabase/migrations/YYYYMMDDHHMMSS_plugin_tasks.sql`

```sql
create schema if not exists module_tasks;

-- Tenant settings (status defs, identifier prefix, stale days)
create table module_tasks.tenant_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  identifier_prefix text not null default 'ENG',
  stale_after_days integer not null default 7,
  task_status_definitions jsonb not null default '[]'::jsonb,
  primary key (tenant_id, scope_id)
);

create table module_tasks.task_identifier_sequences (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  prefix text not null default 'ENG',
  last_value integer not null default 0,
  primary key (tenant_id, scope_id, prefix)
);

create table module_tasks.goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'achieved', 'cancelled')),
  parent_id uuid references module_tasks.goals(id) on delete set null,
  owner_user_id uuid references core.users(id) on delete set null,
  target_date date,
  metric jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table module_tasks.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  identifier text not null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  goal_id uuid references module_tasks.goals(id) on delete set null,
  parent_id uuid references module_tasks.tasks(id) on delete set null,
  primary_assignee_kind text not null default 'none'
    check (primary_assignee_kind in ('user', 'agent', 'none')),
  primary_assignee_user_id uuid references core.users(id) on delete set null,
  primary_assignee_agent_type_key text,
  created_by_user_id uuid references core.users(id) on delete set null,
  created_by_agent_type_key text,
  due_date date,
  request_depth integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  checkout_run_id uuid, -- FK to ai.agent_session_run added Phase 4
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope_id, identifier)
);

create table module_tasks.task_collaborators (
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  user_id uuid not null references core.users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table module_tasks.task_contexts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  context_type text not null, -- e.g. 'project'
  context_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (task_id, context_type, context_id)
);

create table module_tasks.task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  content text not null,
  created_by_user_id uuid references core.users(id) on delete set null,
  created_by_agent_type_key text,
  created_at timestamptz not null default now()
);

-- RLS: standard tenant + scope pattern (see module_projects)
```

- [ ] `pnpm migrations:aggregate` + local apply
- [ ] Add `src/schema-verification.test.ts` (table exists smoke)

---

## UI sketch reference

No UI this phase. See [assets/ui-sketch-tasks-list.png](./assets/ui-sketch-tasks-list.png) for target.

---

## Exit criteria

- [x] Module discoverable; builds with `pnpm --filter @engenty/tasks build`
- [x] Migration applies cleanly (`20260522120000_plugin_tasks.sql`)
- [x] `tasks` appears as mandatory in plugin admin (`apps/core/src/plugins/mandatory-plugins.ts`)
- [x] Contract tests still pass
- [x] **Zero** changes to `modules/projects` task tables (until Phase 7)
