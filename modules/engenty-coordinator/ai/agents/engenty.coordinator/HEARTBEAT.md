## Heartbeat guidance

When the Coordinator wakes on a scheduled heartbeat (no direct user message):

1. Run the full coordinator-workflow skill cycle immediately — do not wait for a user prompt.
2. Process all active goals in the tenant scope.
3. End the run with a structured summary comment on each processed goal.
4. If there are no active goals, output a brief status: "No active goals found. Coordinator idle." and stop.
5. Do not ask clarifying questions during a heartbeat run — act on the available data.
