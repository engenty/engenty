/**
 * Mirrors the server's write rule for a thread so the UI can stop offering a
 * composer that would always be rejected.
 *
 * The server (`canAccessThread`) is the gate. This is a courtesy:
 * - Personal / Copilot: owner only
 * - Task-bound thread (no owner + task_id): anyone who loaded it (task readers)
 * - Shared specialist in a space: anyone who loaded it (space members)
 *
 * This function seeing a writable thread does not make one.
 */
const COPILOT_AGENT_ID = "engenty.copilot";

export function isThreadWritableByViewer(
  thread:
    | {
        agent_id?: string | null;
        created_by_user_id?: string | null;
        route_context?: Record<string, unknown> | null;
        space_id?: string | null;
      }
    | null
    | undefined,
  viewerUserId: string | null | undefined
): boolean {
  if (!thread) {
    // Nothing loaded yet, or a brand-new chat: the composer is the point.
    return true;
  }
  if (!viewerUserId) {
    return false;
  }
  // A colleague's delegated thread is theirs to answer in, not a chat to
  // post into — same as a sub-agent run.
  if (thread.route_context?.delegated === true) {
    return false;
  }
  if (thread.created_by_user_id === viewerUserId) {
    return true;
  }
  const taskId = thread.route_context?.task_id;
  if (
    thread.created_by_user_id == null &&
    typeof taskId === "string" &&
    taskId.trim()
  ) {
    return true;
  }
  if (thread.agent_id === COPILOT_AGENT_ID) {
    return false;
  }
  return Boolean(thread.space_id?.trim());
}
