// "Plan only" has to actually park the task. The create path and the
// re-dispatch path read DIFFERENT status sets on purpose, and the difference is
// easy to collapse by accident — `backlog` stays checkout-eligible (a task
// parked there can still be picked up later) but must not start a task that a
// person deliberately created into it.

import { describe, expect, it } from "vitest";
import {
  startsOnCreate,
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
} from "./task-lifecycle.js";

describe("creating a task into a status", () => {
  it("starts a todo task", () => {
    expect(startsOnCreate("todo")).toBe(true);
  });

  it("does NOT start a task created into the backlog", () => {
    expect(startsOnCreate("backlog")).toBe(false);
  });

  it("keeps backlog checkout-eligible so a parked task can be re-dispatched", () => {
    // If this ever flips, a task that comes to rest in the backlog can never
    // be worked again without someone moving it by hand.
    expect(TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has("backlog")).toBe(true);
  });

  it("never auto-starts a status an agent could not check out anyway", () => {
    for (const status of ["in_review", "blocked", "done", "cancelled"]) {
      expect(startsOnCreate(status)).toBe(false);
    }
  });
});
