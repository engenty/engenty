export function isAgentSessionNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ai session get HTTP 404\b/i.test(message);
}
