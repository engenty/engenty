/**
 * In-process automation hook bus for module events (e.g. KB inbox created).
 * Hosts register listeners; modules emit after successful mutations. Execution
 * (queue, run-agent-once) is owned by the host — this module only fans out.
 */

export const AUTOMATION_HOOK_KB_INBOX_ITEM_CREATED =
  "knowledge-base.inbox.item.created" as const;

export type AutomationHookPayload = Readonly<Record<string, unknown>>;

export type AutomationHookListener = (
  hookId: string,
  payload: AutomationHookPayload
) => void;

const listeners = new Set<AutomationHookListener>();

/** Subscribe to all hook emissions. Returns unsubscribe. */
export function registerAutomationHookListener(
  listener: AutomationHookListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notify listeners synchronously; listener errors are swallowed so emitters stay safe. */
export function emitAutomationHook(
  hookId: string,
  payload: AutomationHookPayload
): void {
  for (const listener of listeners) {
    try {
      listener(hookId, payload);
    } catch {
      // Hosts should wrap heavy work; swallow to avoid breaking HTTP handlers.
    }
  }
}
