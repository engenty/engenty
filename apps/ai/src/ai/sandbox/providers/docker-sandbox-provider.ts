import { mkdirSync } from "node:fs";
import path from "node:path";

import { DockerSandbox, type DockerSandboxOptions } from "@mastra/docker";

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

export function buildDockerSandboxOptions(params: {
  // Extra host->container binds (e.g. tenant `/shared`). Sources must exist on
  // the host at `docker run` time, so we mkdir them here.
  extraMounts?: SandboxExtraMount[];
  image: string;
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
}): DockerSandboxOptions {
  const stagingPath = params.input.layout.stagingPath;
  const containerWorkdir =
    params.mountPath ?? DEFAULT_DOCKER_SANDBOX_MOUNT_PATH;
  mkdirSync(stagingPath, { recursive: true });
  const volumes: Record<string, string> = {
    [stagingPath]: containerWorkdir,
  };
  for (const extra of params.extraMounts ?? []) {
    mkdirSync(extra.layout.stagingPath, { recursive: true });
    volumes[extra.layout.stagingPath] = extra.containerPath;
  }
  return {
    id: buildDockerSandboxId(params.input),
    image: params.image,
    timeout: params.input.timeoutMs,
    volumes,
    workingDir: containerWorkdir,
  };
}

export function createDockerSandboxInstance(
  options: DockerSandboxOptions
): DockerSandbox {
  return new DockerSandbox(options);
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

  // Push the workspace out, then tear down the container.
  async destroy(): Promise<void> {
    await super.destroy();
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
  // Extra writable mounts (e.g. tenant `/shared`) to bind + sync.
  extraMounts?: SandboxExtraMount[];
  image: string;
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
  tenantId: string;
  useRemoteStorageSync: boolean;
}): { dockerSandbox: DockerSandbox; provider: EngentySandboxProvider } {
  const mountPath = params.mountPath ?? DEFAULT_DOCKER_SANDBOX_MOUNT_PATH;
  const extraMounts = params.extraMounts ?? [];
  const dockerSandbox = createDockerSandboxInstance(
    buildDockerSandboxOptions({
      extraMounts,
      image: params.image,
      input: params.input,
      mountPath,
    })
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
