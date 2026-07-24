---
id: engenty-coordinator.heartbeat
name: Coordinator heartbeat
schedule: "0 * * * *"
enabled_by_default: true
suppress_if_no_op: true
target:
  kind: task_template
  task_template:
    agent_type_key: engenty.coordinator
    title: Coordinator heartbeat
    description: Hourly coordination cycle — reap stale checkouts, review finished work, unstick goals.
    priority: medium
---
Run one coordination cycle. Work strictly in this order and stop when done —
this is housekeeping, not a planning marathon.

1. **Reap stale checkouts.** Call `tasks_reap_stale_checkouts` (no input).
   It releases tasks whose run died and re-queues them. Mention the count in
   your result note; if it reaped anything, say which tasks.
2. **Review finished specialist work.** Follow the coordinator-workflow
   skill's audit loop for every active goal you own (`goals_list` with
   `status=active`, `owner_agent_type_key=engenty.coordinator`): review
   `in_review` tasks (done, or back to `todo` with feedback), flag stale
   tasks, create tasks for real gaps, advance goal status when everything is
   terminal.
3. **Report.** Your result note is the cycle report: reaped count, tasks
   reviewed (done vs sent back), goals advanced, gaps created. One short
   paragraph — if the cycle was a no-op, reply with exactly `ROUTINE_OK`
   (alone). A substantive report may end with `ROUTINE_OK`; the token is
   stripped and the body is still posted as a report.
   If a human should look at something, end with
   `ROUTINE_REVIEW: <one line why>`.
