# @engenty/context-graph

Typed cross-module entity and edge store. **Current state only** — no
temporal history, no LLM extraction, no vector index.

An optional module (stage `alpha`: off for an Organisation until a superadmin
turns it on). Other modules reach it only through the plugin-sdk hooks
`registerContextGraphSchema`, `registerContextGraphSource` and
`server.contextGraph`; without it those do nothing. The `onEvents` bindings
run on this module's own events, and core gates `server.contextGraph` by the
Organisation's module state (`apps/core/src/plugins/context-graph-gate.ts`).

## What's here

- **Ontology registry** (`src/registry.ts`) — every module's
  `engenty.server.registerContextGraphSchema(...)` merges into one
  store keyed by dotted type id (e.g. `contacts.person`,
  `contacts_works_at`).
- **Server API** (`src/server-api.ts`) — `engenty.server.contextGraph.*`
  with `upsertEntity` / `deleteEntity` / `getEntity` / `listEntities` /
  `upsertEdge` / `deleteEdge` / `listEdges` / `getOntology`. Writes
  validate against the registry before hitting the DAL.
- **Event-binding helper** (`src/event-binding.ts`) — declarative
  `onEvents` bindings that mirror module lifecycle events into the graph
  without each module re-implementing the plumbing.
- **Read-only HTTP routes** (`src/api/index.ts`) — `GET
  /api/context-graph/ontology|entities|entities/:id|edges`. No mutation
  routes — writes go only through the plugin-SDK surface.
- **Migration** (`supabase/migrations/`) — `context_graph.entities` +
  `context_graph.edges` with RLS via `core.current_tenant_id()` /
  `core.has_scope()`.

## Pilot

`modules/contacts` — see
[`docs/content/wip/context-graph/contacts-pilot.md`](../../docs/content/wip/context-graph/contacts-pilot.md)
for schemas, live `onEvents` sync, backfill script, and verification.

## See

- [`docs/content/wip/context-graph/index.md`](../../docs/content/wip/context-graph/index.md) — concept and **anti-goals** (hard constraints)
- [`docs/content/wip/context-graph/v0-design.md`](../../docs/content/wip/context-graph/v0-design.md) — package layout, schema, plugin-SDK + HTTP surface
- [`docs/content/wip/context-graph/v0-plan.md`](../../docs/content/wip/context-graph/v0-plan.md) — phased implementation checklist
- [`docs/content/wip/context-graph/contacts-pilot.md`](../../docs/content/wip/context-graph/contacts-pilot.md) — contacts module integration
