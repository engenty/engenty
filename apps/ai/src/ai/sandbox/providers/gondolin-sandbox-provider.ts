import { mkdirSync } from "node:fs";
import path from "node:path";

import type { EngentyCoreFileStorageClient } from "../../workspace/core-file-storage-client.js";
import type {
  CreateEngentySandboxProviderInput,
  EngentySandboxProvider,
} from "../sandbox-provider.js";
import { resolveSandboxScopeKey } from "../sandbox-storage-paths.js";
import type { SandboxExtraMount } from "../sandbox-types.js";
import {
  BaseEngentySandboxProvider,
  type BaseSandboxProviderParams,
} from "./base-sandbox-provider.js";
import {
  type GondolinExtraMount,
  GondolinSandbox,
} from "./gondolin-sandbox.js";

// Default guest mount root for the sandbox staging dir — same agent-visible path
// as the Docker provider so absolute `/sandbox` cwds resolve identically.
export const DEFAULT_GONDOLIN_SANDBOX_MOUNT_PATH = "/sandbox";

// VM id keyed by the lifecycle-stable scope (session -> thread), matching the
// Docker sandbox id scheme so the two providers are interchangeable.
export function buildGondolinSandboxId(
  input: CreateEngentySandboxProviderInput
): string {
  return `engenty-${resolveSandboxScopeKey(input.identity)}`;
}

// Map extra writable bind mounts (e.g. tenant `/shared`, `/home`) to Gondolin's
// host->guest mount shape.
function toGondolinExtraMounts(
  extraMounts: SandboxExtraMount[]
): GondolinExtraMount[] {
  return extraMounts.map((mount) => ({
    guestPath: mount.containerPath,
    hostPath: mount.layout.stagingPath,
  }));
}

// Mirror the Docker provider's cwd mapping: the guest mount root IS the sandbox
// mount path, so an absolute cwd the agent provides (e.g. `/sandbox/data`) maps
// 1:1, and a relative cwd is joined under the mount root.
function resolveGuestCwd(cwd: string | undefined, mountRoot: string): string {
  if (!cwd) {
    return mountRoot;
  }
  if (cwd.startsWith("/")) {
    return cwd;
  }
  return path.posix.join(mountRoot, cwd);
}

export class GondolinEngentySandboxProvider extends BaseEngentySandboxProvider {
  readonly id: string;
  readonly provider = "gondolin" as const;
  readonly gondolinSandbox: GondolinSandbox;

  constructor(
    params: Omit<BaseSandboxProviderParams, "sandbox"> & {
      gondolinSandbox: GondolinSandbox;
    }
  ) {
    super({ ...params, sandbox: params.gondolinSandbox });
    this.gondolinSandbox = params.gondolinSandbox;
    this.id = params.gondolinSandbox.id;
  }

  protected resolveCwd(cwd: string | undefined): string {
    return resolveGuestCwd(cwd, this.mountPath);
  }

  // Push the workspace out, then close the VM.
  async destroy(): Promise<void> {
    await super.destroy();
    await this.gondolinSandbox._destroy();
  }
}

export function createGondolinEngentySandboxPair(params: {
  backend: "qemu" | "krun";
  client: EngentyCoreFileStorageClient | null;
  extraMounts?: SandboxExtraMount[];
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
  tenantId: string;
  useRemoteStorageSync: boolean;
}): { gondolinSandbox: GondolinSandbox; provider: EngentySandboxProvider } {
  const mountPath = params.mountPath ?? DEFAULT_GONDOLIN_SANDBOX_MOUNT_PATH;
  const extraMounts = params.extraMounts ?? [];
  // RealFSProvider mounts existing host dirs into the guest, so the staging
  // sources must exist at VM-create time (mirrors the Docker provider's mkdir).
  mkdirSync(params.input.layout.stagingPath, { recursive: true });
  for (const extra of extraMounts) {
    mkdirSync(extra.layout.stagingPath, { recursive: true });
  }
  const gondolinSandbox = new GondolinSandbox({
    backend: params.backend,
    extraMounts: toGondolinExtraMounts(extraMounts),
    id: buildGondolinSandboxId(params.input),
    mountPath,
    stagingPath: params.input.layout.stagingPath,
    timeoutMs: params.input.timeoutMs,
  });
  return {
    gondolinSandbox,
    provider: new GondolinEngentySandboxProvider({
      client: params.client,
      extraLayouts: extraMounts.map((mount) => mount.layout),
      gondolinSandbox,
      input: params.input,
      mountPath,
      tenantId: params.tenantId,
      useRemoteStorageSync: params.useRemoteStorageSync,
    }),
  };
}
