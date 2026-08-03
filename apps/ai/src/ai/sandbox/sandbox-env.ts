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
