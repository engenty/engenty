import type { AgentWorkspaceSandbox } from "./sandbox-types.js";

// Unified prebaked sandbox runtime (bun + python3 + uv + small universal libs).
// Built from `deploy/Dockerfile.sandbox`; covers both TS (via bun) and Python in
// one image, so image selection no longer branches on declared runtimes.
export const DEFAULT_SANDBOX_IMAGE = "engenty-sandbox:latest";

// Provider that actually runs model-generated code in an isolated sandbox.
// Docker is the ONLY agent-execution provider — sandbox doctrine 2026-08-03:
// agent execution = Docker sandbox, tenant Apps = agentOS (apps/app-host).
// The Gondolin micro-VM tier was removed (git history has it); adding another
// provider is a doctrine change, not a config option.
export type ResolvedSandboxProvider = "docker";

// Resolve which sandbox provider to use. Env (`ENGENTY_SANDBOX_PROVIDER`) wins
// over the agent declaration; the default is `docker`. We fail loudly on any
// unsupported value rather than silently degrading — a misconfigured sandbox
// must never fall back to running code on the AI host. `local` is rejected for
// the same reason it always was: there is no host-execution provider.
export function resolveSandboxProvider(
  declared?: AgentWorkspaceSandbox["provider"]
): ResolvedSandboxProvider {
  const fromEnv = process.env.ENGENTY_SANDBOX_PROVIDER?.trim().toLowerCase();
  const requested = fromEnv || declared;
  if (!requested || requested === "docker") {
    return "docker";
  }
  const source = fromEnv
    ? `ENGENTY_SANDBOX_PROVIDER="${requested}"`
    : `workspace.sandbox.provider="${requested}"`;
  throw new Error(
    `${source} is not supported — the agent sandbox supports "docker" only.`
  );
}

export function resolveSandboxDockerImage(): string {
  // The unified image already ships both bun (TS) and python+uv, so there is no
  // per-runtime image split anymore — only the env override or the default.
  const fromEnv = process.env.ENGENTY_SANDBOX_DOCKER_IMAGE?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_SANDBOX_IMAGE;
}

export function resolveSandboxDefaultTimeoutMs(declared?: number): number {
  const fromEnv = Number.parseInt(
    process.env.ENGENTY_SANDBOX_TIMEOUT_MS?.trim() ?? "",
    10
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return declared ?? 120_000;
}

export function resolveSandboxMaxOutputBytes(): number {
  const fromEnv = Number.parseInt(
    process.env.ENGENTY_SANDBOX_MAX_OUTPUT_BYTES?.trim() ?? "",
    10
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return 256 * 1024;
}

// cgroup ceilings for a sandbox container. Docker's defaults are unlimited
// memory, CPU and PIDs, so without these one runaway allocation in
// model-generated code takes the whole host down.
export interface SandboxResourceLimits {
  cpuPeriodUs: number;
  cpuQuotaUs: number;
  memoryBytes: number;
  pidsLimit: number;
}

// Linux CFS period Docker itself uses; quota is expressed against it, so
// `quota = cpus * period` gives whole-core units.
const CPU_PERIOD_US = 100_000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveFloatEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name]?.trim() ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSandboxResourceLimits(): SandboxResourceLimits {
  const cpus = readPositiveFloatEnv("ENGENTY_SANDBOX_CPUS", 1);
  return {
    cpuPeriodUs: CPU_PERIOD_US,
    cpuQuotaUs: Math.max(1, Math.round(cpus * CPU_PERIOD_US)),
    memoryBytes: readPositiveIntEnv(
      "ENGENTY_SANDBOX_MEMORY_BYTES",
      512 * 1024 * 1024
    ),
    pidsLimit: readPositiveIntEnv("ENGENTY_SANDBOX_PIDS_LIMIT", 256),
  };
}

// Network reach granted to a sandbox container. `none` is the default because
// the two things model code normally needs — engenty tools and Code Mode's RPC
// — both travel over stdio to the host, not over the network. `egress` is for
// the runs that genuinely fetch (package installs, third-party APIs) and routes
// through the egress proxy rather than the default bridge.
export type SandboxNetworkTier = "none" | "egress";

export interface SandboxNetworkPlan {
  env: Record<string, string>;
  network: string;
}

const DEFAULT_EGRESS_NETWORK = "bridge";

/**
 * Map a declared network tier onto the Docker network and proxy env.
 *
 * The egress network and proxy URL are host config, not agent config: an
 * operator points `ENGENTY_SANDBOX_EGRESS_NETWORK` at the proxy's network and
 * `ENGENTY_SANDBOX_EGRESS_PROXY_URL` at the proxy itself, and every `egress`
 * sandbox is allowlisted by that one service. Without a proxy URL the tier
 * still works — it just reaches the whole internet through the default bridge.
 */
export function resolveSandboxNetworkPlan(
  tier: SandboxNetworkTier
): SandboxNetworkPlan {
  if (tier === "none") {
    return { env: {}, network: "none" };
  }
  const network =
    process.env.ENGENTY_SANDBOX_EGRESS_NETWORK?.trim() ||
    DEFAULT_EGRESS_NETWORK;
  const proxyUrl = process.env.ENGENTY_SANDBOX_EGRESS_PROXY_URL?.trim();
  if (!proxyUrl) {
    return { env: {}, network };
  }
  // Lower-case variants too: curl reads `http_proxy`, most language runtimes
  // read the upper-case ones, and uv/pip read both.
  return {
    env: {
      HTTPS_PROXY: proxyUrl,
      HTTP_PROXY: proxyUrl,
      NO_PROXY: "localhost,127.0.0.1",
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      no_proxy: "localhost,127.0.0.1",
    },
    network,
  };
}

/**
 * Network tier for the SPACE COMPUTER.
 *
 * Space config, never agent config: the machine's HostConfig is fixed by
 * whoever creates it first, so a per-agent declaration would make the
 * machine's reach depend on run ordering — the exact collision the per-agent
 * session containers were split to avoid. One machine per space means the
 * SPACE is the narrowest level that stays deterministic, which is why the
 * admin control lives on `core.spaces.computer_network_tier`.
 *
 * `egress` is the default because the agents on this machine are expected to
 * install packages and reach third-party APIs; an admin who wants a sealed
 * space sets `none` on the space, and an operator who wants a sealed HOST
 * sets `ENGENTY_SPACE_COMPUTER_NETWORK_TIER=none`.
 */
export function resolveSpaceComputerNetworkTier(
  /** The space's own setting; null/undefined inherits the host default. */
  spaceTier?: SandboxNetworkTier | null
): SandboxNetworkTier {
  if (spaceTier === "none" || spaceTier === "egress") {
    return spaceTier;
  }
  const fromEnv = process.env.ENGENTY_SPACE_COMPUTER_NETWORK_TIER?.trim();
  return fromEnv === "none" ? "none" : "egress";
}

// A read-only root filesystem is the end state: everything the sandbox legally
// writes has a bind or a tmpfs (the workspace mount, the package caches,
// `/tmp`). It stays opt-in via env until every image path is confirmed covered,
// because the failure mode is an install that dies mid-run.
export function resolveSandboxReadonlyRootfs(): boolean {
  return process.env.ENGENTY_SANDBOX_READONLY_ROOTFS?.trim() === "true";
}

// uid the sandbox image's unprivileged user runs as (`deploy/Dockerfile.sandbox`).
// The host chowns bind sources to it so a non-root container can write them;
// override only when running a custom image with a different user.
export function resolveSandboxUserId(): number {
  const parsed = Number.parseInt(
    process.env.ENGENTY_SANDBOX_UID?.trim() ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}
