import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readSandboxAdmissionState,
  reconcileSandboxSlots,
  resetSandboxAdmissionForTests,
  type SandboxAdmissionScope,
  SandboxAdmissionTimeoutError,
  setSandboxLeaseObserver,
  withSandboxAdmissionControl,
} from "../sandbox-admission.js";

function createFakeSandbox(id: string, scope: SandboxAdmissionScope = {}) {
  const calls = { destroy: 0, start: 0 };
  const sandbox = withSandboxAdmissionControl(
    {
      _destroy: async () => {
        calls.destroy += 1;
      },
      id,
      start: async () => {
        calls.start += 1;
      },
    },
    scope
  );
  return { calls, sandbox };
}

describe("sandbox admission control", () => {
  beforeEach(() => {
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT", "1");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Drop anything a failing test left holding.
    reconcileSandboxSlots(new Set());
    expect(readSandboxAdmissionState().held).toBe(0);
    expect(readSandboxAdmissionState().queued).toBe(0);
    resetSandboxAdmissionForTests();
  });

  it("blocks a second start until the first sandbox is destroyed", async () => {
    const first = createFakeSandbox("engenty-run-1");
    const second = createFakeSandbox("engenty-run-2");

    await first.sandbox.start();
    expect(readSandboxAdmissionState().held).toBe(1);

    let admitted = false;
    const pending = second.sandbox.start().then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(second.calls.start).toBe(0);
    expect(readSandboxAdmissionState().queued).toBe(1);

    await first.sandbox._destroy();
    await pending;
    expect(admitted).toBe(true);
    expect(second.calls.start).toBe(1);

    await second.sandbox._destroy();
  });

  it("throws a typed error when the wait expires", async () => {
    vi.stubEnv("ENGENTY_SANDBOX_ADMISSION_TIMEOUT_MS", "10");
    const first = createFakeSandbox("engenty-run-1");
    const second = createFakeSandbox("engenty-run-2");

    await first.sandbox.start();
    await expect(second.sandbox.start()).rejects.toBeInstanceOf(
      SandboxAdmissionTimeoutError
    );
    expect(second.calls.start).toBe(0);

    await first.sandbox._destroy();
  });

  it("does not take a second slot when start is called again on one instance", async () => {
    const only = createFakeSandbox("engenty-session-thread-1");

    await only.sandbox.start();
    // Code Mode's missing-container recovery calls start() a second time.
    await only.sandbox.start();

    expect(only.calls.start).toBe(2);
    expect(readSandboxAdmissionState().held).toBe(1);

    await only.sandbox._destroy();
  });

  it("releases the slot when start itself fails", async () => {
    const failing = withSandboxAdmissionControl({
      _destroy: async () => {
        // never reached
      },
      id: "engenty-run-boom",
      start: async () => {
        throw new Error("docker down");
      },
    });

    await expect(failing.start()).rejects.toThrow(/docker down/);
    expect(readSandboxAdmissionState().held).toBe(0);
  });

  it("reclaims slots whose container is gone", async () => {
    const leaked = createFakeSandbox("engenty-run-leaked");
    await leaked.sandbox.start();
    expect(readSandboxAdmissionState().held).toBe(1);

    // The container is still listed — nothing to reclaim.
    expect(reconcileSandboxSlots(new Set(["engenty-run-leaked"]))).toBe(0);
    expect(readSandboxAdmissionState().held).toBe(1);

    // The run died without tearing down.
    expect(reconcileSandboxSlots(new Set())).toBe(1);
    expect(readSandboxAdmissionState().held).toBe(0);
  });

  it("caps a single tenant below the global ceiling", async () => {
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT", "8");
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT_PER_TENANT", "1");
    const busy = createFakeSandbox("engenty-run-a", { tenantId: "t1" });
    const alsoBusy = createFakeSandbox("engenty-run-b", { tenantId: "t1" });
    const other = createFakeSandbox("engenty-run-c", { tenantId: "t2" });

    await busy.sandbox.start();

    let secondAdmitted = false;
    const queued = alsoBusy.sandbox.start().then(() => {
      secondAdmitted = true;
    });
    await Promise.resolve();
    expect(secondAdmitted).toBe(false);

    // A different tenant is not behind t1 in the queue — the host has room.
    await other.sandbox.start();
    expect(other.calls.start).toBe(1);

    await busy.sandbox._destroy();
    await queued;
    expect(alsoBusy.calls.start).toBe(1);

    await alsoBusy.sandbox._destroy();
    await other.sandbox._destroy();
  });

  it("caps a single space below the tenant ceiling", async () => {
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT", "8");
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT_PER_TENANT", "4");
    vi.stubEnv("ENGENTY_SANDBOX_MAX_CONCURRENT_PER_SPACE", "1");
    const first = createFakeSandbox("engenty-run-a", {
      spaceId: "s1",
      tenantId: "t1",
    });
    const second = createFakeSandbox("engenty-run-b", {
      spaceId: "s1",
      tenantId: "t1",
    });
    const otherSpace = createFakeSandbox("engenty-run-c", {
      spaceId: "s2",
      tenantId: "t1",
    });

    await first.sandbox.start();
    let admitted = false;
    const queued = second.sandbox.start().then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);

    await otherSpace.sandbox.start();
    expect(otherSpace.calls.start).toBe(1);

    await first.sandbox._destroy();
    await queued;

    await second.sandbox._destroy();
    await otherSpace.sandbox._destroy();
  });

  it("reports a finished lease with its scope and duration", async () => {
    const leases: {
      durationMs: number;
      spaceId?: string;
      tenantId?: string;
    }[] = [];
    setSandboxLeaseObserver((lease) => {
      leases.push({
        durationMs: lease.durationMs,
        ...(lease.spaceId ? { spaceId: lease.spaceId } : {}),
        ...(lease.tenantId ? { tenantId: lease.tenantId } : {}),
      });
    });
    const metered = createFakeSandbox("engenty-run-metered", {
      spaceId: "s1",
      tenantId: "t1",
    });

    await metered.sandbox.start();
    expect(leases).toHaveLength(0);
    await metered.sandbox._destroy();

    expect(leases).toHaveLength(1);
    expect(leases[0].tenantId).toBe("t1");
    expect(leases[0].spaceId).toBe("s1");
    expect(leases[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports a lease reclaimed by reconcile, so a leak still meters", async () => {
    const leases: string[] = [];
    setSandboxLeaseObserver((lease) => leases.push(lease.sandboxId));
    const leaked = createFakeSandbox("engenty-run-leaked", { tenantId: "t1" });
    await leaked.sandbox.start();

    expect(reconcileSandboxSlots(new Set())).toBe(1);
    expect(leases).toEqual(["engenty-run-leaked"]);
  });
});
