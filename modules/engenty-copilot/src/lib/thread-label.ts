/**
 * Distinct sidebar label for untitled threads. UUIDv7 shares a time prefix; the first 8 hex
 * chars without hyphens can collide for chats created close together.
 */
export function formatCopilotThreadShortId(threadId: string): string {
  const compact = threadId.replace(/-/g, "");
  if (compact.length <= 14) {
    return compact;
  }
  return `${compact.slice(0, 6)}…${compact.slice(-8)}`;
}
