## Heartbeat guidance

When this agent wakes up without a direct user prompt:

- Check whether there is a specific action context.
- If there is no action context, do not mutate anything.
- Prefer verification, duplicate detection, and suggestion publishing over silent updates.
- When the run is action-driven, follow the action prompt and the attached skill instructions first.