// The user's browser: one headless-Chromium service container PER USER PER
// SPACE (`engenty-browser-<tenant>-<space>-<user>`), driven over CDP by
// apps/ai in that user's name. A SERVICE, not an exec sandbox — nothing
// executes commands in it, so it is created with the docker CLI carrying
// Mastra's sandbox labels (the catalog, Reset and the sweeps find it like any
// other container) and nothing of Mastra's exec machinery. It exists only when the user asked
// for it (PLAN-user-browser.md D1) and never joins a machine's network (D2):
// agents browse through host-side tools, never through raw CDP from a sandbox.
//
// Continuity lives in the PROFILE BIND, not the container: cookies and
// logged-in sessions sit under `spaces/<space>/ai/browser/profile/<user>/`, so
// they survive stops, Resets and image upgrades — and belong to exactly one
// person. Reachability is two networks: the browser's own sealed egress
// network (all traffic through the logged browser proxy) and the view
// network it is attached to after start, where only engenty-ai lives.

import { execFile } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";

import { resolveLocalMountBasePath } from "../workspace/local-workspace-paths.js";
import {
  type EngentyDockerSandboxRow,
  listEngentyDockerSandboxes,
} from "./engenty-sandbox-docker.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";
import { stageBindSource } from "./providers/docker-sandbox-provider.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/space-browser" });

const DEFAULT_BROWSER_IMAGE = "engenty-browser:latest";
const DEFAULT_IDLE_STOP_MS = 15 * 60 * 1000;
const DEFAULT_MAX_PER_TENANT = 4;
const DEFAULT_MAX_PER_USER = 2;
const USER_BROWSER_ID_PREFIX = "engenty-browser-";
export const SPACE_BROWSER_CDP_PORT = 9222;
/** Where the browser saves files; bound to the space's downloads staging. */
export const USER_BROWSER_DOWNLOADS_CONTAINER_PATH = "/downloads";
/** Where a space machine sees every user's browser downloads. */
export const SPACE_BROWSER_DOWNLOADS_MOUNT_PATH = "/sandbox/browser-downloads";

export type UserBrowserState = "absent" | "running" | "stopped";

export interface UserBrowserIdentity {
  spaceId: string;
  tenantId: string;
  userId: string;
}

export interface UserBrowserStatus {
  cdpUrl: string;
  sandboxId: string;
  state: UserBrowserState;
}

export class UserBrowserLimitError extends Error {
  readonly code = "user_browser_limit";
  readonly dimension: "tenant" | "user";
  readonly limit: number;

  constructor(dimension: "tenant" | "user", limit: number) {
    super(`user_browser_limit: ${dimension} ceiling of ${limit} reached`);
    this.name = "UserBrowserLimitError";
    this.dimension = dimension;
    this.limit = limit;
  }
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSpaceBrowserImage(): string {
  return (
    process.env.ENGENTY_BROWSER_DOCKER_IMAGE?.trim() || DEFAULT_BROWSER_IMAGE
  );
}

// Chromium's ceiling. Above the sandbox default on purpose — modern pages OOM
// a 512 MB cap routinely.
function resolveSpaceBrowserMemoryBytes(): number {
  const parsed = Number.parseInt(
    process.env.ENGENTY_BROWSER_MEMORY_BYTES?.trim() ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024 * 1024 * 1024;
}

export function resolveUserBrowserIdleStopMs(): number {
  return readPositiveIntEnv(
    "ENGENTY_BROWSER_IDLE_STOP_MS",
    DEFAULT_IDLE_STOP_MS
  );
}

export function resolveUserBrowserMaxPerTenant(): number {
  return readPositiveIntEnv(
    "ENGENTY_BROWSER_MAX_PER_TENANT",
    DEFAULT_MAX_PER_TENANT
  );
}

export function resolveUserBrowserMaxPerUser(): number {
  return readPositiveIntEnv(
    "ENGENTY_BROWSER_MAX_PER_USER",
    DEFAULT_MAX_PER_USER
  );
}

export function isUserBrowserSandboxId(sandboxId: string): boolean {
  return sandboxId.startsWith(USER_BROWSER_ID_PREFIX);
}

export function buildUserBrowserSandboxId(
  identity: UserBrowserIdentity
): string {
  return `${USER_BROWSER_ID_PREFIX}${identity.tenantId}-${identity.spaceId}-${identity.userId}`;
}

/**
 * The browser's nominal CDP address — its container name on the view
 * network. For display and identity only: Chromium's DevTools endpoint
 * refuses a `Host` header that is not an IP literal or `localhost`, so the
 * connection itself goes to {@link resolveUserBrowserCdpEndpoint}.
 */
export function resolveUserBrowserCdpUrl(
  identity: UserBrowserIdentity
): string {
  return `http://${buildUserBrowserSandboxId(identity)}:${SPACE_BROWSER_CDP_PORT}`;
}

/**
 * Where apps/ai actually dials the browser. On a deployment: the
 * container's IP on the view network (an IP literal, which DevTools
 * accepts). On a dev host running apps/ai outside Docker: the loopback port
 * the container published, since a container name resolves nowhere on the
 * host. Throws when the container is not running — the caller wakes it.
 */
export async function resolveUserBrowserCdpEndpoint(
  identity: UserBrowserIdentity
): Promise<string> {
  const sandboxId = buildUserBrowserSandboxId(identity);
  const { viewNetwork } = resolveUserBrowserNetworkPlan();
  if (viewNetwork) {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "-f",
      `{{(index .NetworkSettings.Networks "${viewNetwork}").IPAddress}}`,
      sandboxId,
    ]);
    const ip = stdout.trim();
    if (!ip) {
      throw new Error(
        `user_browser_unreachable: ${sandboxId} has no address on ${viewNetwork}`
      );
    }
    return `http://${ip}:${SPACE_BROWSER_CDP_PORT}`;
  }
  const hostPort = await readPublishedCdpPort(sandboxId);
  if (!hostPort) {
    throw new Error(
      `user_browser_unreachable: ${sandboxId} publishes no CDP port`
    );
  }
  return `http://127.0.0.1:${hostPort}`;
}

async function readPublishedCdpPort(sandboxId: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "port",
      sandboxId,
      `${SPACE_BROWSER_CDP_PORT}/tcp`,
    ]);
    // `127.0.0.1:55001` (one line per address family).
    const match = /:(\d+)\s*$/m.exec(stdout.trim());
    return match ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/** The user's Chromium profile on the host — cookies, logins, history. */
export function resolveUserBrowserProfilePath(
  identity: UserBrowserIdentity
): string {
  return resolveLocalMountBasePath(
    identity.tenantId,
    `ai/browser/profile/${identity.userId}/`,
    identity.spaceId
  );
}

/**
 * The space's browser downloads root on the host. One directory per space
 * with a subdirectory per user: the browser binds its own subdirectory at
 * `/downloads`, the space machine binds the root at
 * `/sandbox/browser-downloads`, so a file the browser saved is the same byte
 * a machine run reads under `/sandbox/browser-downloads/<user>/`.
 */
export function resolveSpaceBrowserDownloadsRootPath(
  tenantId: string,
  spaceId: string
): string {
  return resolveLocalMountBasePath(tenantId, "ai/browser/downloads/", spaceId);
}

function resolveUserBrowserDownloadsPath(
  identity: UserBrowserIdentity
): string {
  return path.join(
    resolveSpaceBrowserDownloadsRootPath(identity.tenantId, identity.spaceId),
    identity.userId
  );
}

export interface UserBrowserNetworkPlan {
  env: Record<string, string>;
  network: string;
  /** Network engenty-ai shares with browsers; null on a host without one. */
  viewNetwork: string | null;
}

/**
 * The browser's networks are host config, separate from the sandbox egress
 * plan: a browser must never share a network with a machine (D2), and its
 * proxy is a different proxy (open + logged, not an allowlist). Without a
 * proxy URL the browser dials directly — a dev host, not a deployment.
 */
export function resolveUserBrowserNetworkPlan(): UserBrowserNetworkPlan {
  const network =
    process.env.ENGENTY_BROWSER_EGRESS_NETWORK?.trim() || "bridge";
  const proxyUrl = process.env.ENGENTY_BROWSER_EGRESS_PROXY_URL?.trim();
  const viewNetwork = process.env.ENGENTY_BROWSER_VIEW_NETWORK?.trim() || null;
  return {
    // The entrypoint turns this into `--proxy-server`; nothing else in the
    // container reads it (Chromium ignores HTTP_PROXY in headless mode).
    env: proxyUrl ? { ENGENTY_BROWSER_EGRESS_PROXY_URL: proxyUrl } : {},
    network,
    viewNetwork,
  };
}

// Last use per browser, in-memory, stamped by tool calls and stream frames
// (PLAN-user-browser.md §2.3). Deliberately NOT persisted — same reasoning as
// the space computer: after a restart the sweep falls back to container age,
// and a stop is cheap because the profile is a bind.
const lastUsedMs = new Map<string, number>();

export function markUserBrowserUsed(sandboxId: string): void {
  lastUsedMs.set(sandboxId, Date.now());
}

export function getUserBrowserLastUsedMs(sandboxId: string): number | null {
  return lastUsedMs.get(sandboxId) ?? null;
}

// Whoever holds a live CDP session (the registry, P2) is told before the
// container goes away, so it can close its connection instead of discovering
// a dead socket mid-step.
type UserBrowserStopListener = (sandboxId: string) => Promise<void> | void;
let stopListener: UserBrowserStopListener | null = null;

export function setUserBrowserStopListener(
  listener: UserBrowserStopListener | null
): void {
  stopListener = listener;
}

async function notifyStop(sandboxId: string): Promise<void> {
  try {
    await stopListener?.(sandboxId);
  } catch (err) {
    logger.warn("user browser stop listener failed", {
      message: err instanceof Error ? err.message : String(err),
      sandboxId,
    });
  }
}

async function findBrowserRow(
  sandboxId: string
): Promise<EngentyDockerSandboxRow | null> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: false });
  return rows.find((row) => row.sandbox_id === sandboxId) ?? null;
}

export async function readUserBrowserStatus(
  identity: UserBrowserIdentity
): Promise<UserBrowserStatus> {
  const sandboxId = buildUserBrowserSandboxId(identity);
  const row = await findBrowserRow(sandboxId);
  return {
    cdpUrl: resolveUserBrowserCdpUrl(identity),
    sandboxId,
    state: row ? (row.state === "running" ? "running" : "stopped") : "absent",
  };
}

/**
 * The browser ceilings: running browsers per tenant and per user, host-wide.
 * Separate from the sandbox admission slots on purpose — those are taken per
 * run and returned at run end, while a browser has no run: it runs until
 * idle-stop. A stopped browser holds nothing; waking it counts again.
 */
async function assertBrowserRoom(identity: UserBrowserIdentity): Promise<void> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  let tenantHeld = 0;
  let userHeld = 0;
  for (const row of rows) {
    const parsed = parseEngentySandboxId(row.sandbox_id);
    if (
      parsed?.lifecycle !== "browser" ||
      parsed.tenant_id !== identity.tenantId
    ) {
      continue;
    }
    tenantHeld += 1;
    if (parsed.user_id === identity.userId) {
      userHeld += 1;
    }
  }
  const perUser = resolveUserBrowserMaxPerUser();
  if (userHeld >= perUser) {
    throw new UserBrowserLimitError("user", perUser);
  }
  const perTenant = resolveUserBrowserMaxPerTenant();
  if (tenantHeld >= perTenant) {
    throw new UserBrowserLimitError("tenant", perTenant);
  }
}

/**
 * Attach the browser to the view network — the one engenty-ai is on. Post-
 * start because Mastra's `DockerSandbox` takes exactly one `network`, and
 * that one is the sealed egress network. Idempotent: a woken container is
 * still attached, and Docker says so.
 */
async function connectViewNetwork(
  containerName: string,
  viewNetwork: string
): Promise<void> {
  try {
    await execFileAsync("docker", [
      "network",
      "connect",
      viewNetwork,
      containerName,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|already connected/i.test(message)) {
      return;
    }
    throw err;
  }
}

/**
 * Start (or wake) the user's browser in this space. Declared, never
 * implicit: only the browser route calls this — a chat turn must not conjure
 * a service. Idempotent by container identity: Docker reuses the labelled
 * container and `start()` wakes a stopped one, profile intact.
 */
export async function startUserBrowser(
  identity: UserBrowserIdentity
): Promise<UserBrowserStatus> {
  const sandboxId = buildUserBrowserSandboxId(identity);
  const existing = await findBrowserRow(sandboxId);
  if (existing?.state !== "running") {
    await assertBrowserRoom(identity);
  }
  const networkPlan = resolveUserBrowserNetworkPlan();
  const profilePath = resolveUserBrowserProfilePath(identity);
  const downloadsPath = resolveUserBrowserDownloadsPath(identity);
  stageBindSource(profilePath);
  stageBindSource(downloadsPath);
  // A killed container leaves Chromium's singleton lock in the bind-mounted
  // profile, and the next instance then refuses the profile as "in use on
  // another computer". The profile has exactly one legitimate user — this
  // one container — so clearing the lock before start is always correct.
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      rmSync(path.join(profilePath, lock), { force: true });
    } catch {
      // A live symlink target it cannot resolve; Chromium re-creates these.
    }
  }
  const memory = resolveSpaceBrowserMemoryBytes();
  // A dev host reaches the browser only through a published loopback port;
  // a container created before that (or by an older build) without one is
  // recreated — the profile is a bind, nothing is lost.
  let row = existing;
  if (
    row &&
    !networkPlan.viewNetwork &&
    (await readPublishedCdpPort(sandboxId)) === null
  ) {
    await execFileAsync("docker", ["rm", "-f", row.container_id]);
    row = null;
  }
  if (!row) {
    await execFileAsync("docker", [
      "create",
      "--name",
      sandboxId,
      // Mastra's labels, so the catalog, Reset and the sweeps see this
      // container exactly like one Mastra created.
      "--label",
      "mastra.sandbox=true",
      "--label",
      `mastra.sandbox.id=${sandboxId}`,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--memory",
      String(memory),
      "--memory-swap",
      String(memory),
      "--pids-limit",
      "512",
      // Chromium renders in /tmp and /dev/shm; --disable-dev-shm-usage moves
      // the latter into /tmp, so one capped tmpfs covers both.
      "--tmpfs",
      "/tmp:rw,size=512m,mode=1777",
      "-v",
      `${profilePath}:/profile`,
      "-v",
      `${downloadsPath}:${USER_BROWSER_DOWNLOADS_CONTAINER_PATH}`,
      "-w",
      "/profile",
      "--network",
      networkPlan.network,
      ...Object.entries(networkPlan.env).flatMap(([key, value]) => [
        "-e",
        `${key}=${value}`,
      ]),
      ...(networkPlan.viewNetwork
        ? []
        : ["-p", `127.0.0.1:0:${SPACE_BROWSER_CDP_PORT}`]),
      resolveSpaceBrowserImage(),
      "/usr/local/bin/browser-entrypoint.sh",
    ]);
  }
  await execFileAsync("docker", ["start", sandboxId]);
  if (networkPlan.viewNetwork) {
    await connectViewNetwork(sandboxId, networkPlan.viewNetwork);
  }
  markUserBrowserUsed(sandboxId);
  logger.info("user browser started", {
    sandboxId,
    spaceId: identity.spaceId,
    userId: identity.userId,
  });
  return {
    cdpUrl: resolveUserBrowserCdpUrl(identity),
    sandboxId,
    state: "running",
  };
}

async function stopContainer(containerId: string): Promise<void> {
  await execFileAsync("docker", ["stop", "--time", "10", containerId]);
}

/** `docker stop` the user's browser; the profile — and the container — stay. */
export async function stopUserBrowser(
  identity: UserBrowserIdentity
): Promise<UserBrowserStatus> {
  const sandboxId = buildUserBrowserSandboxId(identity);
  const row = await findBrowserRow(sandboxId);
  if (row?.state === "running") {
    await notifyStop(sandboxId);
    await stopContainer(row.container_id);
    lastUsedMs.delete(sandboxId);
  }
  return {
    cdpUrl: resolveUserBrowserCdpUrl(identity),
    sandboxId,
    state: row ? "stopped" : "absent",
  };
}

/**
 * Sign out: stop the browser and EMPTY its profile. The one action that
 * forgets logins — Reset (container removal) deliberately does not, because
 * the profile is a bind and Reset is about the container. Wiping the
 * directory's contents rather than the directory keeps the bind source in
 * place for the next start.
 */
export async function signOutUserBrowser(
  identity: UserBrowserIdentity
): Promise<UserBrowserStatus> {
  const status = await stopUserBrowser(identity);
  const profilePath = resolveUserBrowserProfilePath(identity);
  let entries: string[] = [];
  try {
    entries = readdirSync(profilePath);
  } catch {
    // Never started: nothing to forget.
  }
  for (const entry of entries) {
    rmSync(path.join(profilePath, entry), { force: true, recursive: true });
  }
  logger.info("user browser signed out", {
    sandboxId: status.sandboxId,
    spaceId: identity.spaceId,
    userId: identity.userId,
  });
  return status;
}

/**
 * Stop user browsers idle past the TTL. Idle = no tool call and no stream
 * frame through this process since the cutoff; a browser whose last use
 * predates the process falls back to container age. Never rejects; runs
 * from the staging reaper's tick.
 */
export async function sweepIdleUserBrowsers(
  rows: readonly {
    container_id: string;
    created_at_ms: number | null;
    sandbox_id: string;
  }[]
): Promise<number> {
  const cutoff = Date.now() - resolveUserBrowserIdleStopMs();
  let stopped = 0;
  for (const row of rows) {
    if (parseEngentySandboxId(row.sandbox_id)?.lifecycle !== "browser") {
      continue;
    }
    const idleSince =
      getUserBrowserLastUsedMs(row.sandbox_id) ?? row.created_at_ms;
    if (idleSince === null || idleSince > cutoff) {
      continue;
    }
    try {
      await notifyStop(row.sandbox_id);
      await stopContainer(row.container_id);
      lastUsedMs.delete(row.sandbox_id);
      stopped += 1;
    } catch (err) {
      logger.warn("failed to stop idle user browser", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: row.sandbox_id,
      });
    }
  }
  if (stopped > 0) {
    logger.info("stopped idle user browsers", { stopped });
  }
  return stopped;
}

/** Tests only — the last-used table and stop listener are process-global. */
export function resetUserBrowserStateForTests(): void {
  lastUsedMs.clear();
  stopListener = null;
}
