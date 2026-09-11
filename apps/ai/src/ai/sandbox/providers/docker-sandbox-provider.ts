import { chownSync, mkdirSync } from "node:fs";
import path from "node:path";

import { DockerSandbox, type DockerSandboxOptions } from "@mastra/docker";

import type { EngentyCoreFileStorageClient } from "../../workspace/core-file-storage-client.js";
import {
  releaseSandboxSlot,
  type SandboxAdmissionScope,
  withSandboxAdmissionControl,
} from "../sandbox-admission.js";
import {
  resolveSandboxNetworkPlan,
  resolveSandboxReadonlyRootfs,
  resolveSandboxResourceLimits,
  resolveSandboxUserId,
  type SandboxNetworkTier,
} from "../sandbox-env.js";
import type {
  CreateEngentySandboxProviderInput,
  EngentySandboxProvider,
} from "../sandbox-provider.js";
import { resolveSandboxScopeKey } from "../sandbox-storage-paths.js";
import type { SandboxExtraMount } from "../sandbox-types.js";
import { withSpaceComputerExecSerialization } from "../space-computer.js";
import {
  BaseEngentySandboxProvider,
  type BaseSandboxProviderParams,
} from "./base-sandbox-provider.js";

// Default container workdir / bind target. We bind the staging dir to the
// agent-visible sandbox mount path (e.g. `/sandbox`) so absolute paths the
// model writes via workspace file tools resolve to the same location when a
// command runs in the container.
export const DEFAULT_DOCKER_SANDBOX_MOUNT_PATH = "/sandbox";

// Container id keyed by the lifecycle-stable scope (session -> thread), so the
// suspend and resume turns reconnect to the SAME container (Docker reuses it by
// the `mastra.sandbox.id` label) rather than churning a fresh one each turn.
export function buildDockerSandboxId(
  input: CreateEngentySandboxProviderInput
): string {
  return `engenty-${resolveSandboxScopeKey(input.identity)}`;
}

/**
 * Create a bind source the sandbox user can actually write.
 *
 * The AI service runs as root, so a directory it creates is root-owned, while
 * the sandbox image runs as an unprivileged uid — a bind of the one into the
 * other is read-only in practice. Docker exposes no per-container user knob
 * through `DockerSandboxOptions`, so the host aligns ownership instead.
 *
 * A failing chown is not an error: on a dev machine the service is not root and
 * the container runtime maps bind ownership through its own VM anyway.
 */
export function stageBindSource(hostPath: string): void {
  mkdirSync(hostPath, { recursive: true });
  const uid = resolveSandboxUserId();
  try {
    chownSync(hostPath, uid, uid);
  } catch {
    // Not root, or a filesystem that does not carry ownership.
  }
}

export function buildDockerSandboxOptions(params: {
  // Container env beyond the network plan's proxy vars (e.g. package-cache
  // redirects for the bound cache mounts).
  env?: Record<string, string>;
  // Extra host->container binds (e.g. tenant `/shared`). Sources must exist on
  // the host at `docker run` time, so we mkdir them here.
  extraMounts?: SandboxExtraMount[];
  image: string;
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
  network?: SandboxNetworkTier;
}): DockerSandboxOptions {
  const stagingPath = params.input.layout.stagingPath;
  const containerWorkdir =
    params.mountPath ?? DEFAULT_DOCKER_SANDBOX_MOUNT_PATH;
  stageBindSource(stagingPath);
  const volumes: Record<string, string> = {
    [stagingPath]: containerWorkdir,
  };
  for (const extra of params.extraMounts ?? []) {
    stageBindSource(extra.layout.stagingPath);
    volumes[extra.layout.stagingPath] = extra.containerPath;
  }
  // The machine's $HOME lives on its DRIVE, not in the tmpfs a per-run
  // sandbox gets: dotfiles, venvs and user-installed packages are the
  // continuity idle-stop exists to preserve, and (per §2.2b) they belong to
  // drive state — so they survive Reset too. System paths stay root-owned
  // and unwritable either way; persistent installs go to $HOME or /sandbox.
  const isSpaceComputer = params.input.identity.lifecycle === "space";
  if (isSpaceComputer) {
    const homePath = path.join(stagingPath, "..", "home");
    stageBindSource(homePath);
    volumes[homePath] = "/opt/sandbox";
  }
  const limits = resolveSandboxResourceLimits();
  const networkPlan = resolveSandboxNetworkPlan(params.network ?? "none");
  return {
    // Model-generated code needs no privileged operation: it reads and writes
    // its bind mounts and spawns processes. Dropping every capability costs it
    // nothing and takes container-escape primitives off the table.
    capDrop: ["ALL"],
    cpuPeriod: limits.cpuPeriodUs,
    cpuQuota: limits.cpuQuotaUs,
    env: { ...networkPlan.env, ...params.env },
    id: buildDockerSandboxId(params.input),
    image: params.image,
    memory: limits.memoryBytes,
    // Equal to `memory` on purpose: Docker's default when only `Memory` is set
    // is twice that in swap, which would silently double the ceiling on any
    // host that has swap.
    memorySwap: limits.memoryBytes,
    network: networkPlan.network,
    pidsLimit: limits.pidsLimit,
    readonlyRootfs: resolveSandboxReadonlyRootfs(),
    securityOpt: ["no-new-privileges:true"],
    timeout: params.input.timeoutMs,
    // Scratch that survives a read-only rootfs and is capped, so filling it
    // fills the tmpfs rather than the host disk. `$HOME` is here too because a
    // read-only root otherwise breaks every tool that writes a dotfile — git
    // config, `~/.npmrc`, uv's `~/.local` — none of which is worth persisting
    // and all of which would be silent failures mid-run.
    tmpfs: {
      ...(isSpaceComputer ? {} : { "/opt/sandbox": "rw,size=64m,mode=1777" }),
      "/tmp": "rw,size=256m,mode=1777",
    },
    volumes,
    workingDir: containerWorkdir,
  };
}

export function createDockerSandboxInstance(
  options: DockerSandboxOptions,
  scope?: SandboxAdmissionScope
): DockerSandbox {
  // Every sandbox in the process is created here, so this is where the host's
  // concurrency ceiling is enforced — see `withSandboxAdmissionControl` — and
  // where a space computer's exec serialization is applied. The teardown path
  // passes no scope: it never starts the container, so it never takes a slot.
  return withSpaceComputerExecSerialization(
    withSandboxAdmissionControl(new DockerSandbox(options), scope)
  );
}

function resolveContainerCwd(
  cwd: string | undefined,
  containerWorkdir: string
): string {
  if (!cwd) {
    return containerWorkdir;
  }
  // The container workdir IS the sandbox mount path, so an absolute cwd the
  // agent provides (e.g. `/sandbox/data`) already maps 1:1 inside the container.
  if (cwd.startsWith("/")) {
    return cwd;
  }
  return path.posix.join(containerWorkdir, cwd);
}

// Wraps a Mastra `DockerSandbox` (the same instance the Workspace runs). The
// bind target / container workdir is `mountPath`, so absolute `/sandbox` cwds
// from the agent map 1:1 inside the container.
export class DockerEngentySandboxProvider extends BaseEngentySandboxProvider {
  readonly id: string;
  readonly provider = "docker" as const;
  readonly dockerSandbox: DockerSandbox;

  constructor(
    params: Omit<BaseSandboxProviderParams, "sandbox"> & {
      dockerSandbox: DockerSandbox;
    }
  ) {
    super({ ...params, sandbox: params.dockerSandbox });
    this.dockerSandbox = params.dockerSandbox;
    this.id = params.dockerSandbox.id;
  }

  protected resolveCwd(cwd: string | undefined): string {
    return resolveContainerCwd(cwd, this.mountPath);
  }

  // Push the workspace out, then tear down the container — except a space
  // computer, which outlives its runs by definition: its container stays
  // running (the idle sweep stops it, Reset removes it), so only the run's
  // admission slot is returned. Releasing here rather than at idle-stop keeps
  // the machine's lease equal to the run that used it — the same unit the
  // metering observer records — and keeps N queued runs in a space from
  // pinning N slots on one container.
  async destroy(): Promise<void> {
    await super.destroy();
    if (this.input.identity.lifecycle === "space") {
      // Guarded on status: a run that never executed anything never started
      // the sandbox, so it holds no slot — releasing anyway would return a
      // slot some CONCURRENT run on the same machine is still using.
      if (this.dockerSandbox.status === "running") {
        releaseSandboxSlot(this.dockerSandbox.id);
      }
      return;
    }
    await this.dockerSandbox._destroy();
  }
}

export function createDockerEngentySandboxProvider(
  params: Omit<BaseSandboxProviderParams, "sandbox"> & {
    dockerSandbox: DockerSandbox;
  }
): EngentySandboxProvider {
  return new DockerEngentySandboxProvider(params);
}

export function createDockerEngentySandboxPair(params: {
  client: EngentyCoreFileStorageClient | null;
  env?: Record<string, string>;
  // Extra writable mounts (e.g. tenant `/shared`) to bind + sync.
  extraMounts?: SandboxExtraMount[];
  image: string;
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
  network?: SandboxNetworkTier;
  tenantId: string;
  useRemoteStorageSync: boolean;
}): { dockerSandbox: DockerSandbox; provider: EngentySandboxProvider } {
  const mountPath = params.mountPath ?? DEFAULT_DOCKER_SANDBOX_MOUNT_PATH;
  const extraMounts = params.extraMounts ?? [];
  const dockerSandbox = createDockerSandboxInstance(
    buildDockerSandboxOptions({
      env: params.env,
      extraMounts,
      image: params.image,
      input: params.input,
      mountPath,
      network: params.network,
    }),
    {
      runId: params.input.identity.runId,
      ...(params.input.identity.spaceId
        ? { spaceId: params.input.identity.spaceId }
        : {}),
      tenantId: params.input.identity.tenantId,
    }
  );
  return {
    dockerSandbox,
    provider: createDockerEngentySandboxProvider({
      client: params.client,
      dockerSandbox,
      extraLayouts: extraMounts.map((mount) => mount.layout),
      input: params.input,
      mountPath,
      tenantId: params.tenantId,
      useRemoteStorageSync: params.useRemoteStorageSync,
    }),
  };
}
