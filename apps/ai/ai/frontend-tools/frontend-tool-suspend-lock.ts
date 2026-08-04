// Mastra 1.52 wedges when two tools suspend in the same agentic step —
// `resumeStream()` cannot find the first suspended run once a second
// suspension shares the step (see apps/ai conversation parallel-approval
// regression). Frontend tools must suspend (the browser executes them), so
// we serialize suspends per conversation thread: the next tool waits until
// the previous suspend has been resumed.
//
// Mastra re-invokes `execute` with `resumeData` on resume (the original
// `await suspend()` does not continue), so the resume path releases the
// slot that the suspending invocation acquired. Releases are token-scoped
// so a late resume of an abandoned suspend() cannot steal the next holder's
// slot.

export type FrontendToolSuspendTicket = symbol;

interface SuspendSlot {
  owner: FrontendToolSuspendTicket | null;
  waiters: Array<{
    resolve: (ticket: FrontendToolSuspendTicket) => void;
  }>;
}

const slots = new Map<string, SuspendSlot>();

function slotFor(key: string): SuspendSlot {
  let slot = slots.get(key);
  if (!slot) {
    slot = { owner: null, waiters: [] };
    slots.set(key, slot);
  }
  return slot;
}

/** Acquire the per-thread suspend slot (FIFO). Returns an owner ticket. */
export async function acquireFrontendToolSuspendSlot(
  key: string
): Promise<FrontendToolSuspendTicket> {
  const slot = slotFor(key);
  const ticket = Symbol(`frontend-tool-suspend:${key}`);
  if (!slot.owner) {
    slot.owner = ticket;
    return ticket;
  }
  return await new Promise<FrontendToolSuspendTicket>((resolve) => {
    slot.waiters.push({ resolve });
  });
}

/**
 * Release the per-thread suspend slot. Only the current owner ticket is
 * accepted — stale releases from an abandoned suspend() are ignored.
 */
export function releaseFrontendToolSuspendSlot(
  key: string,
  ticket?: FrontendToolSuspendTicket | null
): void {
  const slot = slots.get(key);
  if (!slot) {
    return;
  }
  // Resume path may not know the suspending ticket (different execute
  // invocation) — a null/undefined ticket means "force release current owner".
  if (ticket != null && slot.owner !== ticket) {
    return;
  }
  const next = slot.waiters.shift();
  if (next) {
    const nextTicket = Symbol(`frontend-tool-suspend:${key}`);
    slot.owner = nextTicket;
    next.resolve(nextTicket);
    return;
  }
  slot.owner = null;
  slots.delete(key);
}

/** Test helper — drop all slots between cases. */
export function resetFrontendToolSuspendSlotsForTests(): void {
  slots.clear();
}
