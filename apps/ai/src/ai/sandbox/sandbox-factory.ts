import type { WorkspaceSandbox } from "@mastra/core/workspace";

import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import type { EngentyWorkspaceFsMode } from "../workspace/workspace-fs-mode.js";
import { shouldUseRemoteWorkspaceSync } from "../workspace/workspace-fs-mode.js";
import { createDockerEngentySandboxPair } from "./providers/docker-sandbox-provider.js";
import { createGondolinEngentySandboxPair } from "./providers/gondolin-sandbox-provider.js";
import {
  resolveSandboxDefaultTimeoutMs,
  resolveSandboxDockerImage,
  resolveSandboxGondolinBackend,
  resolveSandboxProvider,
} from "./sandbox-env.js";
import type {
  CreateEngentySandboxProviderInput,
  EngentySandboxProvider,
} from "./sandbox-provider.js";
import type {
  AgentWorkspaceSandbox,
  SandboxExtraMount,
} from "./sandbox-types.js";

export interface CreateEngentySandboxProviderResult {
  // The single Mastra executor (DockerSandbox / GondolinSandbox) the Workspace
  // attaches; the provider delegates `runCommand` to this same instance.
  mastraSandbox: WorkspaceSandbox;
  provider: EngentySandboxProvider;
}

// Only the execution-relevant slice of the sandbox declaration — matches the
// parsed runtime spec the loader passes (no `enabled`/`requireApproval`).
export interface SandboxFactoryConfig {
  lifecycle?: "run" | "session" | "task";
  mountPath?: string;
  // `docker` (default) or `gondolin` (local-dev micro-VM); any other value
  // fails loudly. Env (`ENGENTY_SANDBOX_PROVIDER`) overrides this.
  provider?: AgentWorkspaceSandbox["provider"];
  timeoutMs?: number;
}

export async function createEngentySandboxProvider(params: {
  client: EngentyCoreFileStorageClient | null;
  // Extra writable layouts (e.g. tenant `/shared`) the loader stages locally.
  // Docker binds them into the container; all providers sync them.
  extraMounts?: SandboxExtraMount[];
  fileStorageAccess?: { coreBaseUrl: string; userAccessToken: string } | null;
  input: CreateEngentySandboxProviderInput;
  sandboxConfig?: SandboxFactoryConfig;
  tenantId: string;
  workspaceFsMode: EngentyWorkspaceFsMode;
}): Promise<CreateEngentySandboxProviderResult> {
  // Resolve provider (env overrides declaration); fails loudly on unsupported.
  const sandboxProvider = resolveSandboxProvider(
    params.sandboxConfig?.provider
  );
  const timeoutMs = resolveSandboxDefaultTimeoutMs(
    params.sandboxConfig?.timeoutMs
  );
  const input = { ...params.input, timeoutMs };
  const useRemoteStorageSync = shouldUseRemoteWorkspaceSync({
    fileStorageAccess: params.fileStorageAccess,
    mode: params.workspaceFsMode,
  });
  const mountPath = params.sandboxConfig?.mountPath ?? "/sandbox";
  const extraMounts = params.extraMounts ?? [];

  if (sandboxProvider === "gondolin") {
    const { gondolinSandbox, provider } = createGondolinEngentySandboxPair({
      backend: resolveSandboxGondolinBackend(),
      client: params.client,
      extraMounts,
      input,
      mountPath,
      tenantId: params.tenantId,
      useRemoteStorageSync,
    });
    return { mastraSandbox: gondolinSandbox, provider };
  }

  const image = resolveSandboxDockerImage();
  const { dockerSandbox, provider } = createDockerEngentySandboxPair({
    client: params.client,
    extraMounts,
    image,
    input,
    mountPath,
    tenantId: params.tenantId,
    useRemoteStorageSync,
  });
  return { mastraSandbox: dockerSandbox, provider };
}
