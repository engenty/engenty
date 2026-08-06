export function isAgentThreadNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // Wire-level error text still literally says "session" (thrown by
  // packages/ai-ui/src/ag-ui/apps-ai/apps-ai-session-api.ts, outside this
  // rename's scope) — do not change the pattern until that producer renames.
  return /ai session get HTTP 404\b/i.test(message);
}
