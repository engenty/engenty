import type { AgentWorkspaceSandbox } from "./sandbox-types.js";

// Unified prebaked sandbox runtime (bun + python3 + uv + small universal libs).
// Built from `deploy/Dockerfile.sandbox`; covers both TS (via bun) and Python in
// one image, so image selection no longer branches on declared runtimes.
export const DEFAULT_SANDBOX_IMAGE = "engenty-sandbox:latest";

// Providers that actually run model-generated code in an isolated sandbox.
// `docker` is the default everywhere; `gondolin` is a local-dev micro-VM
// (QEMU/krun) used to exercise the VM path before any production rollout.
export type ResolvedSandboxProvider = "docker" | "gondolin";

// True unless the process is explicitly running in production. Gondolin needs
// hardware virtualization (KVM / Hypervisor.framework) that prod hosts may not
// expose, so it is gated to non-prod and must be opted into deliberately.
function isGondolinAllowedEnv(): boolean {
  if (process.env.ENGENTY_SANDBOX_ALLOW_GONDOLIN?.trim() === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

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
  if (requested === "gondolin") {
    if (!isGondolinAllowedEnv()) {
      throw new Error(
        'sandbox provider "gondolin" is gated to non-production — it needs ' +
          "hardware virtualization (KVM / Hypervisor.framework). Set " +
          "ENGENTY_SANDBOX_ALLOW_GONDOLIN=1 to override."
      );
    }
    return "gondolin";
  }
  const source = fromEnv
    ? `ENGENTY_SANDBOX_PROVIDER="${requested}"`
    : `workspace.sandbox.provider="${requested}"`;
  throw new Error(
    `${source} is not supported — the agent sandbox supports "docker" or "gondolin".`
  );
}

// Gondolin micro-VM backend. QEMU is the mature default; krun is the
// experimental faster backend (needs the optional native runner package).
export function resolveSandboxGondolinBackend(): "qemu" | "krun" {
  const fromEnv =
    process.env.ENGENTY_SANDBOX_GONDOLIN_BACKEND?.trim().toLowerCase();
  return fromEnv === "krun" ? "krun" : "qemu";
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
