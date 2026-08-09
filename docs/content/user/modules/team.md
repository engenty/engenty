---
title: Team
description: Team members and their profiles — and the agent operations the copilot uses.
---

# Team

The people in your workspace: their profile, role, and the details other modules
need — who can be assigned work, whose hours appear in time tracking, who
appears on a project.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `team_list` | Reads | List team members |
| `team_get` | Reads | Get team member by ID |
| `team_time_tracking_actor_for_principal` | Reads | Resolve a member profile for time tracking |
| `team_time_tracking_list_catalog` | Reads | List members for the time-tracking catalog |
| `team_create` | Writes | Create team member |
| `team_update` | Writes | Update team member |
| `team_delete` | Writes | Delete team member |
