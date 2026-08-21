/**
 * One passive `pointermove` listener shared by every fluffy engenty on the
 * page, in viewport coordinates. Subscribers are called on a frame the pointer
 * actually moved; the fur renderer already runs its own rAF, so this only has
 * to keep the position fresh.
 */

const position = { x: 0, y: 0 };
const subscribers = new Set<() => void>();
let listening = false;

function onMove(event: PointerEvent) {
  position.x = event.clientX;
  position.y = event.clientY;
  for (const notify of subscribers) {
    notify();
  }
}

/** Latest pointer position, seeded to the upper-right so idle engenties look up. */
export function pointerPosition(): { x: number; y: number } {
  return position;
}

export function subscribePointer(notify: () => void): () => void {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    position.x = window.innerWidth * 0.62;
    position.y = window.innerHeight * 0.28;
    window.addEventListener("pointermove", onMove, { passive: true });
  }
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}
