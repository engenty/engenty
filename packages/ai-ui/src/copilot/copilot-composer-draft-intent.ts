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

/** Register the mounted composer's draft setter. Latest registration wins. */
export function registerCopilotComposerDraftSetter(
  hostKey: string,
  setter: DraftSetter
): () => void {
  const setters = settersByHost.get(hostKey) ?? [];
  setters.push(setter);
  settersByHost.set(hostKey, setters);
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
