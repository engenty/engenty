// Copilot sub-agents delegate synchronously via Mastra's supervisor `agents` map —
// not the background task manager. Keep the idle window export for streamUntilIdle.

export const ENGENTY_STREAM_UNTIL_IDLE_MAX_IDLE_MS = 5 * 60_000;
