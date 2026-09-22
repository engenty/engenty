/**
 * Host-keyed bridge from panel/widget affordances into the chat composer
 * (docs/wip/generative-ui.md §3.3). The composer's draft state lives deep in
 * the chat panel; surfaces that own a pane (full-page chat) need to prefill
 * it from outside that tree ("Ask the agent to…" on a record panel). The
 * composer registers its draft setter per host key on mount; panel code
 * reaches it through `ObjectDisplayIntent.askAgent`, never directly.
 */

type DraftSetter = (text: string) => void;

const settersByHost = new Map<string, DraftSetter[]>();

/**
 * A draft waiting for its composer to mount.
 *
 * The blob's floating prompt can start a chat that lives on ANOTHER PAGE, so
 * by the time the text exists the composer that should hold it is one
 * navigation away and no setter is registered yet. Handing the text to the
 * next composer for that host is what stops the prompt being typed and then
 * silently dropped. Drained on the first registration, so a navigation that
 * never lands leaves nothing behind but one unread string.
 */
const pendingByHost = new Map<string, string>();

/** Register the mounted composer's draft setter. Latest registration wins. */
export function registerCopilotComposerDraftSetter(
  hostKey: string,
  setter: DraftSetter
): () => void {
  const setters = settersByHost.get(hostKey) ?? [];
  setters.push(setter);
  settersByHost.set(hostKey, setters);
  const pending = pendingByHost.get(hostKey);
  if (pending !== undefined) {
    pendingByHost.delete(hostKey);
    setter(pending);
  }
  return () => {
    const current = settersByHost.get(hostKey);
    if (!current) {
      return;
    }
    const index = current.indexOf(setter);
    if (index >= 0) {
      current.splice(index, 1);
    }
    if (current.length === 0) {
      settersByHost.delete(hostKey);
    }
  };
}

/** Prefill the composer bound to a host key. Returns false when none is mounted. */
export function setCopilotComposerDraft(
  hostKey: string,
  text: string
): boolean {
  const setters = settersByHost.get(hostKey);
  const latest = setters?.at(-1);
  if (!latest) {
    return false;
  }
  latest(text);
  return true;
}

/**
 * Prefill the composer for a host key, or hold the text for the next one to
 * mount there. Use this whenever the composer may not exist yet.
 */
export function queueCopilotComposerDraft(hostKey: string, text: string): void {
  if (setCopilotComposerDraft(hostKey, text)) {
    return;
  }
  pendingByHost.set(hostKey, text);
}
