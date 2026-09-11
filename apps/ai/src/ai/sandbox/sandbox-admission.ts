import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "apps/ai/sandbox-admission" });

const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_MAX_PER_TENANT = 4;
const DEFAULT_MAX_PER_SPACE = 2;
const DEFAULT_ADMISSION_TIMEOUT_MS = 60_000;

export class SandboxAdmissionTimeoutError extends Error {
  readonly code = "sandbox_admission_timeout";

  constructor(waitedMs: number, limit: number) {
    super(
      `sandbox_admission_timeout: no sandbox slot free after ${waitedMs}ms (limit ${limit})`
    );
    this.name = "SandboxAdmissionTimeoutError";
  }
}

/**
 * Who a slot is charged to.
 *
 * Both dimensions are optional because one caller genuinely has neither: the
 * teardown path builds a sandbox handle purely to destroy a container, and
 * never starts it.
 */
export interface SandboxAdmissionScope {
  runId?: string;
  spaceId?: string;
  tenantId?: string;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSandboxMaxConcurrent(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_MAX_CONCURRENT",
    DEFAULT_MAX_CONCURRENT
  );
}

export function resolveSandboxMaxConcurrentPerTenant(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_MAX_CONCURRENT_PER_TENANT",
    DEFAULT_MAX_PER_TENANT
  );
}

export function resolveSandboxMaxConcurrentPerSpace(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_MAX_CONCURRENT_PER_SPACE",
    DEFAULT_MAX_PER_SPACE
  );
}

export function resolveSandboxAdmissionTimeoutMs(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_ADMISSION_TIMEOUT_MS",
    DEFAULT_ADMISSION_TIMEOUT_MS
  );
}

interface Waiter {
  reject: (err: Error) => void;
  resolve: () => void;
  sandboxId: string;
  scope: SandboxAdmissionScope;
  /** When the waiter queued — admitted waits are logged with their duration. */
  since: number;
  timer: NodeJS.Timeout;
}

interface Holder {
  count: number;
  scope: SandboxAdmissionScope;
  since: number;
}

// Slots are id-keyed rather than a bare counter so the reconcile pass can tell
// WHICH holder leaked. A count per id (not a set) because a session container
// can be reconnected by two overlapping providers.
const slots = new Map<string, Holder>();
// Ids whose `start()` has not returned yet. They hold a slot but have no
// container in `docker ps`, so reconcile must not treat them as leaked.
const starting = new Map<string, number>();
const waiters: Waiter[] = [];

/**
 * Told about every finished lease, so compute time can be metered without this
 * module reaching into the DAL. Set once at boot; unset in tests.
 */
export type SandboxLeaseObserver = (lease: {
  durationMs: number;
  runId?: string;
  sandboxId: string;
  spaceId?: string;
  tenantId?: string;
}) => void;

let leaseObserver: SandboxLeaseObserver | null = null;

export function setSandboxLeaseObserver(
  observer: SandboxLeaseObserver | null
): void {
  leaseObserver = observer;
}

function bump(map: Map<string, number>, id: string, delta: number): void {
  const next = (map.get(id) ?? 0) + delta;
  if (next > 0) {
    map.set(id, next);
  } else {
    map.delete(id);
  }
}

function heldCount(): number {
  let total = 0;
  for (const holder of slots.values()) {
    total += holder.count;
  }
  return total;
}

function heldFor(key: "spaceId" | "tenantId", value: string): number {
  let total = 0;
  for (const holder of slots.values()) {
    if (holder.scope[key] === value) {
      total += holder.count;
    }
  }
  return total;
}

/**
 * Whether a scope's three ceilings all have room right now.
 *
 * The tenant and space ceilings exist so one busy tenant — or one routine
 * fanning out inside a single space — cannot take every slot on the host and
 * starve everyone else. A caller with no tenant is only bounded globally.
 */
function hasRoomFor(scope: SandboxAdmissionScope): boolean {
  if (heldCount() >= resolveSandboxMaxConcurrent()) {
    return false;
  }
  if (
    scope.tenantId &&
    heldFor("tenantId", scope.tenantId) >=
      resolveSandboxMaxConcurrentPerTenant()
  ) {
    return false;
  }
  if (
    scope.spaceId &&
    heldFor("spaceId", scope.spaceId) >= resolveSandboxMaxConcurrentPerSpace()
  ) {
    return false;
  }
  return true;
}

function take(sandboxId: string, scope: SandboxAdmissionScope): void {
  const existing = slots.get(sandboxId);
  if (existing) {
    existing.count += 1;
  } else {
    slots.set(sandboxId, { count: 1, scope, since: Date.now() });
  }
  bump(starting, sandboxId, 1);
}

/**
 * Admit every queued waiter that now fits.
 *
 * FIFO among the waiters that CAN go: a waiter blocked by its own tenant's
 * ceiling keeps its place in line but does not hold up the tenants behind it,
 * which is the difference between a queue and a convoy.
 */
function admitNext(): void {
  let index = 0;
  while (index < waiters.length) {
    if (heldCount() >= resolveSandboxMaxConcurrent()) {
      return;
    }
    const waiter = waiters[index];
    if (!hasRoomFor(waiter.scope)) {
      index += 1;
      continue;
    }
    waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    take(waiter.sandboxId, waiter.scope);
    // The other half of the queue log below: a run that waited says for how
    // long, so "compute was busy" is reconstructable per run.
    logger.info("sandbox admission admitted", {
      sandboxId: waiter.sandboxId,
      waitedMs: Date.now() - waiter.since,
    });
    waiter.resolve();
  }
}

/**
 * Take one sandbox slot, waiting if the host is saturated.
 *
 * Waiting rather than rejecting is deliberate: a queued routine is fine, a
 * failed one is a support ticket. The wait is bounded so a wedged holder cannot
 * stall a run forever.
 */
export function acquireSandboxSlot(
  sandboxId: string,
  scope: SandboxAdmissionScope = {}
): Promise<void> {
  if (hasRoomFor(scope)) {
    take(sandboxId, scope);
    return Promise.resolve();
  }
  const timeoutMs = resolveSandboxAdmissionTimeoutMs();
  const limit = resolveSandboxMaxConcurrent();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = waiters.findIndex((entry) => entry.timer === timer);
      if (index >= 0) {
        waiters.splice(index, 1);
      }
      reject(new SandboxAdmissionTimeoutError(timeoutMs, limit));
    }, timeoutMs);
    timer.unref();
    waiters.push({
      reject,
      resolve,
      sandboxId,
      scope,
      since: Date.now(),
      timer,
    });
    logger.info("sandbox admission queued", {
      limit,
      queued: waiters.length,
      sandboxId,
      spaceId: scope.spaceId,
      tenantId: scope.tenantId,
    });
  });
}

/** Mark a holder's `start()` as finished, so reconcile can see it in `docker ps`. */
export function finishSandboxStart(sandboxId: string): void {
  bump(starting, sandboxId, -1);
}

export function releaseSandboxSlot(sandboxId: string): void {
  const holder = slots.get(sandboxId);
  if (!holder) {
    return;
  }
  holder.count -= 1;
  if (holder.count <= 0) {
    slots.delete(sandboxId);
    reportLease(sandboxId, holder);
  }
  admitNext();
}

function reportLease(sandboxId: string, holder: Holder): void {
  if (!leaseObserver) {
    return;
  }
  try {
    leaseObserver({
      durationMs: Math.max(0, Date.now() - holder.since),
      sandboxId,
      ...(holder.scope.runId ? { runId: holder.scope.runId } : {}),
      ...(holder.scope.spaceId ? { spaceId: holder.scope.spaceId } : {}),
      ...(holder.scope.tenantId ? { tenantId: holder.scope.tenantId } : {}),
    });
  } catch (err) {
    // Metering must never fail a teardown.
    logger.warn("sandbox lease observer failed", {
      message: err instanceof Error ? err.message : String(err),
      sandboxId,
    });
  }
}

/**
 * Drop slots whose container is gone.
 *
 * A run that dies without tearing down leaks a slot; the `_destroy()` release
 * is inside the run paths' `finally` blocks, so the exposure is narrow but not
 * zero. Called from the staging reaper's tick rather than on a timer of its
 * own.
 */
export function reconcileSandboxSlots(runningSandboxIds: Set<string>): number {
  let released = 0;
  for (const [sandboxId, holder] of [...slots]) {
    if (runningSandboxIds.has(sandboxId) || starting.has(sandboxId)) {
      continue;
    }
    slots.delete(sandboxId);
    released += holder.count;
    reportLease(sandboxId, holder);
  }
  if (released > 0) {
    logger.warn("released leaked sandbox slots", { released });
    admitNext();
  }
  return released;
}

export interface SandboxAdmissionState {
  held: number;
  heldBySpace: Record<string, number>;
  heldByTenant: Record<string, number>;
  limit: number;
  queued: number;
}

export function readSandboxAdmissionState(): SandboxAdmissionState {
  const heldBySpace: Record<string, number> = {};
  const heldByTenant: Record<string, number> = {};
  for (const holder of slots.values()) {
    if (holder.scope.tenantId) {
      heldByTenant[holder.scope.tenantId] =
        (heldByTenant[holder.scope.tenantId] ?? 0) + holder.count;
    }
    if (holder.scope.spaceId) {
      heldBySpace[holder.scope.spaceId] =
        (heldBySpace[holder.scope.spaceId] ?? 0) + holder.count;
    }
  }
  return {
    held: heldCount(),
    heldBySpace,
    heldByTenant,
    limit: resolveSandboxMaxConcurrent(),
    queued: waiters.length,
  };
}

/** Drop all admission state. Tests only — the process holds one shared table. */
export function resetSandboxAdmissionForTests(): void {
  for (const waiter of waiters.splice(0)) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error("sandbox_admission_reset"));
  }
  slots.clear();
  starting.clear();
  leaseObserver = null;
}

interface AdmissionControlled {
  _destroy(): Promise<void>;
  id: string;
  start(): Promise<void>;
}

/**
 * Gate a sandbox's `start()` on a slot and release it on `_destroy()`.
 *
 * `start()` is the choke point on purpose: our provider reaches container
 * creation through `ensureRunning()`, Code Mode calls `start()` on the sandbox
 * directly, and only `start()` is on both paths. Gating there rather than at
 * workspace build also means an idle chat — one whose agent has a sandbox
 * declared but never runs a command — holds no slot.
 */
export function withSandboxAdmissionControl<T extends AdmissionControlled>(
  sandbox: T,
  scope: SandboxAdmissionScope = {}
): T {
  const sandboxId = sandbox.id;
  const start = sandbox.start.bind(sandbox);
  const destroy = sandbox._destroy.bind(sandbox);
  // `start()` is race-safe and gets called more than once (lazily by the
  // workspace, again by Code Mode's missing-container recovery), so admission
  // is per-instance: hold the pending acquire so concurrent calls share it.
  let admission: Promise<void> | null = null;

  sandbox.start = async () => {
    if (!admission) {
      admission = acquireSandboxSlot(sandboxId, scope);
      try {
        await admission;
      } catch (err) {
        admission = null;
        throw err;
      }
      try {
        await start();
      } catch (err) {
        admission = null;
        finishSandboxStart(sandboxId);
        releaseSandboxSlot(sandboxId);
        throw err;
      }
      finishSandboxStart(sandboxId);
      return;
    }
    await admission;
    await start();
  };

  sandbox._destroy = async () => {
    try {
      await destroy();
    } finally {
      if (admission) {
        admission = null;
        releaseSandboxSlot(sandboxId);
      }
    }
  };

  return sandbox;
}
