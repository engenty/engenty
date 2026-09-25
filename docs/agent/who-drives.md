# Who drives what

Engenty has one human-facing assistant, one execution record, and explicit
executors. Space and Workspace provide boundaries and context; neither drives
work. The nouns themselves are defined in
[work-model.md](../content/dev/work-model.md).

| Surface | Driver | Job |
|---|---|---|
| Copilot dock (any page) | `engenty.copilot` | Sit beside the human: navigate, edit records via catalog, coach in the UI. This is the Copilot surface. |
| Space Home | — | Greeting, cards, and optional embed. Not a chat. |
| Remote channel | `engenty.remote` (front door), or the addressed Engenty | Chat-tuned assistant outside the web UI. A binding's default agent or a leading `@handle` / `/to handle` routes the turn to that Engenty, assembled as itself (its tools and memory; no workspace mounts on channel turns yet) — only when its row has *Reachable from channels* on. See [remote-channels.md](../content/dev/remote-channels.md). |
| Engenty desks | the Engenty | Do module work the human addresses directly |
| Routine / unattended | the owning Engenty | Wake on a schedule or event and start a run; the run is the record |

## Two execution lanes

### Live

The human is present and expects an answer now. Copilot may finish bounded work
through catalog operations or call `message_agent` with a self-contained brief
for a Space-mounted Engenty. The existing `agent-*` tools remain internal helpers
for File/CLI/App work while they migrate to the same child-run substrate.

Live Engenty messaging does not create a Task. The reply returns to the
calling conversation.

### Durable

Work that must survive the chat, repeat, wait, coordinate dependencies, or
request later approval outlives the conversation in one of two records:

- a **Routine** is a job on a mounted Engenty — a workflow target plus
  1..n wake sources. Firing it starts a run and creates no Task;
- a **Task** is a work item someone owns. Copilot may create and assign one
  directly; an outcome that needs more than one becomes several Tasks with real
  dependencies. Notifications tell a person something came back; Copilot
  reviews when asked.

The same mounted Engenty can participate in both lanes. `message_agent`
starts an immediate child run; `primary_assignee_agent_type_key` starts a run
whose subject is that Task. Completing the run does not complete the Task.

## Boundaries

- **Copilot** is the live front door (the dock), not the scheduler and not a
  Space resident.
- **Engenty** is a domain executor. The one a Space mounts without a
  `reports_to` is that Space's coordinator (top-level, e.g. the Chief of
  Staff): it also gets the `chief-of-staff` skill — set the Space up, route
  work, hire a teammate — and the coordinator's page tools. Every other Engenty
  reports to it and does not orchestrate.
- **Task** is a work item and the optional subject of a run — never the way to
  make something run.
- **Run** is the one execution record; every lane above converges on it.
- **Routine** is a job on an Engenty, not an agent and not a Task.
- **Space** selects the apps, agents, connections, skills, and module data for a
  run. It is a boundary, not a driver.
- **Workspace** is run-scoped files and context through the mounts actually
  resolved for that lane: `/home`; `/space`, plus `/shared` unless Space-confined; `/task` only when the
  run has a Task subject, with `/project` following that Task's containment
  chain; and read-only `/skills`. It is not a queue or module database.
- **`/data`** exposes mounted module records. It is not scratch space or a
  conversation notebook.
- **Files and artifacts** are deliverable stores/surfaces. A workspace path is
  working context until it is copied or published there.

Tenant remains the authorization boundary.

Do not add a third front-door agent. If a surface needs live conversation, it
uses Copilot (web), `engenty.remote` (channels) or is an explicitly named
agent Desk. A channel reaching an Engenty by handle is that Engenty's desk
spoken to from outside, not a new front door.
