import { afterEach, describe, expect, it } from "vitest";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
  resetFrontendToolSuspendSlotsForTests,
} from "../../../../ai/frontend-tools/frontend-tool-suspend-lock.js";

afterEach(() => {
  resetFrontendToolSuspendSlotsForTests();
});

describe("frontend-tool-suspend-lock", () => {
  it("lets the first acquirer through immediately", async () => {
    const ticket = await acquireFrontendToolSuspendSlot("t1");
    releaseFrontendToolSuspendSlot("t1", ticket);
  });

  it("queues a second acquirer until the first releases", async () => {
    const key = "t-parallel";
    const first = await acquireFrontendToolSuspendSlot(key);

    let secondAcquired = false;
    const second = acquireFrontendToolSuspendSlot(key).then((ticket) => {
      secondAcquired = true;
      return ticket;
    });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    releaseFrontendToolSuspendSlot(key, first);
    const secondTicket = await second;
    expect(secondAcquired).toBe(true);

    releaseFrontendToolSuspendSlot(key, secondTicket);
  });

  it("ignores a stale ticket release after a force resume release", async () => {
    const key = "t-stale";
    const first = await acquireFrontendToolSuspendSlot(key);

    let secondTicket!: symbol;
    const second = acquireFrontendToolSuspendSlot(key).then((ticket) => {
      secondTicket = ticket;
      return ticket;
    });

    // Resume path force-releases (no ticket) — transfers to the waiter.
    releaseFrontendToolSuspendSlot(key);
    await second;
    expect(secondTicket).toBeTruthy();

    // Abandoned first suspend() tries to release its old ticket — no-op.
    releaseFrontendToolSuspendSlot(key, first);

    // Second holder still owns the slot; its release frees it.
    let thirdAcquired = false;
    const third = acquireFrontendToolSuspendSlot(key).then(() => {
      thirdAcquired = true;
    });
    await Promise.resolve();
    expect(thirdAcquired).toBe(false);

    releaseFrontendToolSuspendSlot(key, secondTicket);
    await third;
    expect(thirdAcquired).toBe(true);
    releaseFrontendToolSuspendSlot(key);
  });
});
