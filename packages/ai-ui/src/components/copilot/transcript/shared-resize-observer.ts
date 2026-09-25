// One ResizeObserver for every transcript row that measures itself. A long
// transcript used to hold one observer per row (two, with the fold); the
// browser batches all of them anyway, so a single observer with a callback
// per element does the same work with one object.

type ResizeCallback = (element: Element) => void;

let observer: ResizeObserver | null = null;
const callbacks = new Map<Element, Set<ResizeCallback>>();

function sharedObserver(): ResizeObserver {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const listeners = callbacks.get(entry.target);
      if (!listeners) {
        continue;
      }
      for (const listener of listeners) {
        listener(entry.target);
      }
    }
  });
  return observer;
}

/** Calls `callback` whenever `element` resizes; returns the unsubscribe. */
export function observeElementResize(
  element: Element,
  callback: ResizeCallback
): () => void {
  if (typeof ResizeObserver !== "function") {
    return () => undefined;
  }
  let listeners = callbacks.get(element);
  if (!listeners) {
    listeners = new Set();
    callbacks.set(element, listeners);
    sharedObserver().observe(element);
  }
  listeners.add(callback);
  return () => {
    const current = callbacks.get(element);
    if (!current) {
      return;
    }
    current.delete(callback);
    if (current.size === 0) {
      callbacks.delete(element);
      observer?.unobserve(element);
    }
  };
}
