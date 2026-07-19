"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SubmitMessageOptions } from "../agent-provider/types.js";

// A client-side queue for messages the user composes WHILE a run is in flight.
// The copilot composer otherwise locks during a run; this lets the user keep
// typing — messages queue and auto-send one at a time as each run finishes
// (queue-after). The queue is reorderable, deletable, and any entry can be sent
// immediately: `submit` STOPS the current run for real (server abort, as if the
// user clicked Stop) and then sends, so "send now" = stop current + send.

export interface QueuedCopilotMessage {
  id: string;
  /** Submit options captured at enqueue time (attachments, agent override). */
  options?: SubmitMessageOptions;
  text: string;
}

export type CopilotRunStatus = "ready" | "streaming" | "submitted" | "error";

export interface UseCopilotMessageQueueParams {
  // When true, auto-drain is suspended even at "ready" — e.g. while an approval
  // interrupt is open the run is paused for the user, not finished, so sending
  // the next turn would cut across the pending approval.
  blocked?: boolean;
  // The run status driving the auto-drain: a "ready" transition sends the head.
  status: CopilotRunStatus;
  // Submit a message as a real run. MUST stop any in-flight run first — a real
  // server abort, not just a local stream detach — so "send now" = stop current
  // + send. The caller wraps host.cancel() + host.submitMessage() for this.
  submit: (text: string, options?: SubmitMessageOptions) => void;
  // The thread the queue belongs to. Queued messages are scoped to it: on a
  // thread switch (incl. "New chat") the queue RESETS, so a message composed
  // for one thread can never auto-drain into an unrelated one.
  threadId?: string | null;
}

export interface CopilotMessageQueue {
  /** Discard every queued message without sending (e.g. on Stop). */
  clear: () => void;
  /** Append a message to the queue (no-op for blank text without attachments). */
  enqueue: (text: string, options?: SubmitMessageOptions) => void;
  /** True while there is at least one queued message. */
  hasQueued: boolean;
  /** Move a queued message up/down (no-op at the ends). */
  move: (id: string, direction: "up" | "down") => void;
  queued: QueuedCopilotMessage[];
  /** Remove a queued message without sending it. */
  remove: (id: string) => void;
  /** Move `fromId` to `toId`'s position (drag-and-drop reorder). */
  reorder: (fromId: string, toId: string) => void;
  /** Send a queued message NOW (aborts the current run); the rest stay queued. */
  sendNow: (id: string) => void;
}

let queueIdCounter = 0;
function nextQueueId(): string {
  queueIdCounter += 1;
  return `q-${queueIdCounter}`;
}

export function useCopilotMessageQueue(
  params: UseCopilotMessageQueueParams
): CopilotMessageQueue {
  const [queued, setQueued] = useState<QueuedCopilotMessage[]>([]);

  // Latest values via refs so the callbacks/effect stay stable.
  const submitRef = useRef(params.submit);
  submitRef.current = params.submit;
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  // Guards a single drain while status is still "ready" before `submit` flips it.
  const drainingRef = useRef(false);

  const enqueue = useCallback(
    (text: string, options?: SubmitMessageOptions) => {
      const trimmed = text.trim();
      if (!(trimmed || options?.attachments?.length)) {
        return;
      }
      setQueued((q) => [
        ...q,
        {
          id: nextQueueId(),
          text: trimmed,
          ...(options ? { options } : {}),
        },
      ]);
    },
    []
  );

  const clear = useCallback(() => {
    setQueued((q) => (q.length === 0 ? q : []));
  }, []);

  // Reset when the bound thread changes so queued messages never drain into a
  // different thread than the one they were composed for. A wedged thread the
  // user abandons via "New chat" used to replay its queue into the new thread.
  const threadId = params.threadId ?? null;
  const prevThreadIdRef = useRef(threadId);
  useEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      prevThreadIdRef.current = threadId;
      drainingRef.current = false;
      setQueued((q) => (q.length === 0 ? q : []));
    }
  }, [threadId]);

  const remove = useCallback((id: string) => {
    setQueued((q) => q.filter((m) => m.id !== id));
  }, []);

  const move = useCallback((id: string, direction: "up" | "down") => {
    setQueued((q) => {
      const i = q.findIndex((m) => m.id === id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= q.length) {
        return q;
      }
      const next = [...q];
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setQueued((q) => {
      const from = q.findIndex((m) => m.id === fromId);
      const to = q.findIndex((m) => m.id === toId);
      if (from < 0 || to < 0 || from === to) {
        return q;
      }
      const next = [...q];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }, []);

  const sendNow = useCallback((id: string) => {
    const msg = queuedRef.current.find((m) => m.id === id);
    if (!msg) {
      return;
    }
    setQueued((q) => q.filter((m) => m.id !== id));
    // submit() aborts any in-flight run → "send now" = stop current + send.
    submitRef.current(msg.text, msg.options);
  }, []);

  // Auto-drain: when the thread returns to "ready" with messages queued, send the
  // head. `drainingRef` prevents a double-send while status is momentarily still
  // "ready" right after we submit (before the status state updates).
  useEffect(() => {
    if (params.status !== "ready" || params.blocked) {
      drainingRef.current = false;
      return;
    }
    if (drainingRef.current || queued.length === 0) {
      return;
    }
    drainingRef.current = true;
    const head = queued[0]!;
    setQueued((q) => q.slice(1));
    submitRef.current(head.text, head.options);
  }, [params.status, params.blocked, queued]);

  return {
    clear,
    enqueue,
    hasQueued: queued.length > 0,
    move,
    queued,
    remove,
    reorder,
    sendNow,
  };
}
