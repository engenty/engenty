## Heartbeat guidance

When the Coordinator wakes on a scheduled heartbeat (no direct user message):

1. Run the full coordinator-workflow skill cycle immediately — do not wait for a user prompt.
2. Process only the active goals you own (`owner_agent_type_key = engenty.coordinator`). Never touch human-led goals.
3. End the run with a structured summary comment on each processed goal.
4. If there are no goals assigned to you, output a brief status: "No goals assigned to the coordinator. Idle." and stop.
5. Do not ask clarifying questions during a heartbeat run — act on the available data.
