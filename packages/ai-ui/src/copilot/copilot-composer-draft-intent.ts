/**
 * Host-keyed bridge from panel/widget affordances into the chat composer
 * (docs/wip/generative-ui.md §3.3). The composer's draft state lives deep in
 * the chat panel; surfaces that own a pane (full-page chat) need to prefill
 * it from outside that tree ("Ask the agent to…" on a record panel). The
 * composer registers its draft setter per host key on mount; panel code
 * reaches it through `ObjectDisplayIntent.askAgent`, never directly.
 */

import type { ChatReferenceItem } from "../lib/chat-reference-part.js";

type DraftSetter = (text: string) => void;
/** Adds reference pills to the composer (none: only focuses it). */
type RefAdder = (refs: ChatReferenceItem[]) => void;

const settersByHost = new Map<string, DraftSetter[]>();
const refAddersByHost = new Map<string, RefAdder[]>();

function register<T>(
  map: Map<string, T[]>,
  hostKey: string,
  fn: T
): () => void {
  const list = map.get(hostKey) ?? [];
  list.push(fn);
  map.set(hostKey, list);
  return () => {
    const current = map.get(hostKey);
    if (!current) {
      return;
    }
    const index = current.indexOf(fn);
    if (index >= 0) {
      current.splice(index, 1);
    }
    if (current.length === 0) {
      map.delete(hostKey);
    }
  };
}

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
  const off = register(settersByHost, hostKey, setter);
  const pending = pendingByHost.get(hostKey);
  if (pending !== undefined) {
    pendingByHost.delete(hostKey);
    setter(pending);
  }
  return off;
}

/** Register the mounted composer's reference adder. Latest registration wins. */
export function registerCopilotComposerRefAdder(
  hostKey: string,
  adder: RefAdder
): () => void {
  return register(refAddersByHost, hostKey, adder);
}

/**
 * Prefill the composer bound to a host key and focus it. `refs` become pills
 * over their `@Label` token, which the text must carry. Returns false when no
 * composer is mounted.
 */
export function setCopilotComposerDraft(
  hostKey: string,
  text: string,
  refs: ChatReferenceItem[] = []
): boolean {
  const latest = settersByHost.get(hostKey)?.at(-1);
  if (!latest) {
    return false;
  }
  latest(text);
  refAddersByHost.get(hostKey)?.at(-1)?.(refs);
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
