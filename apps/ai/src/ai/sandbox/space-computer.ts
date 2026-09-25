// The space computer: one long-lived container per space, shared by every run
// that targets it. Same provider machinery as the
// run lease — what makes it a machine is what does NOT happen: run teardown
// keeps the container, the idle sweep STOPS it (`docker stop`, image-layer
// state survives) instead of destroying it, and the next `ensureRunning()`
// wakes it with `docker start`. `docker rm` happens only on Reset (a user
// action) or space deletion.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";
import type { MastraSandbox } from "@mastra/core/workspace";

import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/space-computer" });

const SPACE_COMPUTER_ID_PREFIX = "engenty-space-";
const DEFAULT_IDLE_STOP_MS = 30 * 60 * 1000;

export function isSpaceComputerSandboxId(sandboxId: string): boolean {
  return sandboxId.startsWith(SPACE_COMPUTER_ID_PREFIX);
}

export function resolveSpaceComputerIdleStopMs(): number {
  const parsed = Number.parseInt(
    process.env.ENGENTY_SPACE_COMPUTER_IDLE_STOP_MS?.trim() ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_STOP_MS;
}

// Last exec per machine, in-memory. Deliberately NOT persisted: after a
// process restart the map is empty and the idle sweep falls back to the
// container's created-at, which stops an unused machine soon after a deploy —
// and stopping is cheap, because the next command is one `docker start` away.
const lastUsedMs = new Map<string, number>();

export function markSpaceComputerUsed(sandboxId: string): void {
  lastUsedMs.set(sandboxId, Date.now());
}

export function getSpaceComputerLastUsedMs(sandboxId: string): number | null {
  return lastUsedMs.get(sandboxId) ?? null;
}

// One command at a time per machine, process-wide. The machine is SHARED —
// concurrent runs in the space hold instances with the same sandbox id, all
// resolving to one container with one `/tmp` and one process table, so
// unserialized commands interleave state (§0's surviving objection). Keyed by
// id, not per instance, for exactly that reason. Background processes
// (`processes.spawn`) stay unserialized: long-running servers are the point.
const execTails = new Map<string, Promise<unknown>>();
// Commands queued or running per machine — the visible half of serialization
// — the Computers view shows it, and a wait past
// the threshold below is logged so "the computer is busy" is a fact in the
// telemetry, never a silent stall.
const execQueueDepth = new Map<string, number>();
const QUEUE_WAIT_LOG_MS = 3000;

export function getSpaceComputerQueueDepths(): Record<string, number> {
  const depths: Record<string, number> = {};
  for (const [sandboxId, depth] of execQueueDepth) {
    if (depth > 0) {
      depths[sandboxId] = depth;
    }
  }
  return depths;
}

function bumpQueueDepth(sandboxId: string, delta: number): void {
  const next = (execQueueDepth.get(sandboxId) ?? 0) + delta;
  if (next > 0) {
    execQueueDepth.set(sandboxId, next);
  } else {
    execQueueDepth.delete(sandboxId);
  }
}

function enqueue<T>(sandboxId: string, run: () => Promise<T>): Promise<T> {
  const tail = execTails.get(sandboxId) ?? Promise.resolve();
  const queuedAt = Date.now();
  bumpQueueDepth(sandboxId, 1);
  const next = tail
    .catch(() => undefined)
    .then(() => {
      const waitedMs = Date.now() - queuedAt;
      if (waitedMs >= QUEUE_WAIT_LOG_MS) {
        logger.info("space_computer_queue_wait", { sandboxId, waitedMs });
      }
      return run();
    });
  execTails.set(sandboxId, next);
  next
    .catch(() => undefined)
    .finally(() => {
      bumpQueueDepth(sandboxId, -1);
      if (execTails.get(sandboxId) === next) {
        execTails.delete(sandboxId);
      }
    });
  return next;
}

/**
 * Serialize `executeCommand` on a space computer and stamp its last use.
 *
 * Patched onto the instance the same way `withSandboxAdmissionControl` patches
 * `start` — both the Workspace's `execute_command` tool and the provider's
 * HITL `runCommand` path call this one method, so wrapping it covers every
 * exec. A non-machine sandbox passes through untouched.
 */
export function withSpaceComputerExecSerialization<T extends MastraSandbox>(
  sandbox: T
): T {
  if (!isSpaceComputerSandboxId(sandbox.id)) {
    return sandbox;
  }
  const executeCommand = sandbox.executeCommand;
  if (!executeCommand) {
    return sandbox;
  }
  const bound = executeCommand.bind(sandbox);
  sandbox.executeCommand = ((...args: Parameters<typeof bound>) => {
    markSpaceComputerUsed(sandbox.id);
    return enqueue(sandbox.id, () => {
      markSpaceComputerUsed(sandbox.id);
      return bound(...args);
    });
  }) as typeof executeCommand;
  return sandbox;
}

/**
 * `docker stop` a machine without touching its container filesystem.
 *
 * Plain docker CLI on purpose: a Mastra `DockerSandbox` instance here would be
 * a bare one created only to stop — and `stop()` resolves the container by
 * label anyway. One process call is the whole job.
 */
async function stopContainer(containerId: string): Promise<void> {
  await execFileAsync("docker", ["stop", "--time", "10", containerId]);
}

/**
 * Stop space computers that have been idle past the TTL.
 *
 * Idle = no exec through this process since the cutoff; a machine whose last
 * use predates the process (restart) falls back to container age. Stopping
 * releases the machine's memory while keeping installed packages, dotfiles
 * and detached-process artifacts on its writable layer — the continuity the
 * class exists for. Never rejects; runs from the staging reaper's tick.
 */
export async function sweepIdleSpaceComputers(
  rows: readonly {
    container_id: string;
    created_at_ms: number | null;
    sandbox_id: string;
  }[]
): Promise<number> {
  const cutoff = Date.now() - resolveSpaceComputerIdleStopMs();
  let stopped = 0;
  for (const row of rows) {
    // Machines only. User browsers have their own sweep with their own TTL
    // and last-use stamp (`sweepIdleUserBrowsers`).
    if (parseEngentySandboxId(row.sandbox_id)?.lifecycle !== "space") {
      continue;
    }
    const lastUsed = getSpaceComputerLastUsedMs(row.sandbox_id);
    const idleSince = lastUsed ?? row.created_at_ms;
    if (idleSince === null || idleSince > cutoff) {
      continue;
    }
    try {
      await stopContainer(row.container_id);
      lastUsedMs.delete(row.sandbox_id);
      stopped += 1;
    } catch (err) {
      logger.warn("failed to stop idle space computer", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: row.sandbox_id,
      });
    }
  }
  if (stopped > 0) {
    logger.info("stopped idle space computers", { stopped });
  }
  return stopped;
}

/** Stop one machine by container id — the Computers view's Stop action. */
export async function stopSpaceComputerContainer(
  containerId: string
): Promise<void> {
  await stopContainer(containerId);
}

/**
 * Run one argv in a Space's computer from the host, outside any run — the
 * sign-in forward delivers a browser callback to a CLI that a suspended run
 * started. No shell: `argv` reaches the container as-is. Not queued behind
 * the Space's commands, because the process it talks to is a background one
 * that holds no queue slot. Null when the computer is not running.
 */
export async function execInSpaceComputer(
  input: { spaceId: string; tenantId: string },
  argv: string[],
  options: { maxBuffer: number; timeoutMs: number }
): Promise<{ exitCode: number; stderr: string; stdout: string } | null> {
  const sandboxId = `${SPACE_COMPUTER_ID_PREFIX}${input.tenantId}-${input.spaceId}`;
  const { stdout: ids } = await execFileAsync("docker", [
    "ps",
    "-q",
    "--filter",
    `label=mastra.sandbox.id=${sandboxId}`,
  ]);
  const containerId = ids.trim().split("\n")[0];
  if (!containerId) {
    return null;
  }
  markSpaceComputerUsed(sandboxId);
  try {
    const { stderr, stdout } = await execFileAsync(
      "docker",
      ["exec", containerId, ...argv],
      { maxBuffer: options.maxBuffer, timeout: options.timeoutMs }
    );
    return { exitCode: 0, stderr, stdout };
  } catch (err) {
    const failed = err as { code?: unknown; stderr?: string; stdout?: string };
    return {
      exitCode: typeof failed.code === "number" ? failed.code : 1,
      stderr: failed.stderr ?? String(err),
      stdout: failed.stdout ?? "",
    };
  }
}

/** Tests only — the exec queue and last-used table are process-global. */
export function resetSpaceComputerStateForTests(): void {
  execTails.clear();
  lastUsedMs.clear();
}
