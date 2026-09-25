import type { WorkspaceSandbox } from "@mastra/core/workspace";
import { sandboxTimezoneEnv } from "../tenant-timezone.js";
import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import type { EngentyWorkspaceFsMode } from "../workspace/workspace-fs-mode.js";
import { shouldUseRemoteWorkspaceSync } from "../workspace/workspace-fs-mode.js";
import { createDockerEngentySandboxPair } from "./providers/docker-sandbox-provider.js";
import {
  isSandboxEgressProxied,
  resolveSandboxDefaultTimeoutMs,
  resolveSandboxDockerImage,
  resolveSandboxProvider,
  resolveSpaceComputerNetworkTier,
  type SandboxNetworkTier,
} from "./sandbox-env.js";
import type {
  CreateEngentySandboxProviderInput,
  EngentySandboxProvider,
} from "./sandbox-provider.js";
import type {
  AgentWorkspaceSandbox,
  SandboxExtraMount,
} from "./sandbox-types.js";
import { publishSpaceEgress } from "./space-egress.js";

export interface CreateEngentySandboxProviderResult {
  // The single Mastra executor (DockerSandbox) the Workspace attaches; the
  // provider delegates `runCommand` to this same instance.
  mastraSandbox: WorkspaceSandbox;
  provider: EngentySandboxProvider;
}

// Only the execution-relevant slice of the sandbox declaration — matches the
// parsed runtime spec the loader passes (no `enabled`/`requireApproval`).
export interface SandboxFactoryConfig {
  lifecycle?: "run" | "session" | "task" | "space";
  mountPath?: string;
  // Network reach the agent declared. A REQUEST, not a guarantee: the host
  // decides which docker network `egress` actually resolves to.
  network?: SandboxNetworkTier;
  // `docker` is the only provider; any other value fails loudly. Env
  // (`ENGENTY_SANDBOX_PROVIDER`) overrides this.
  provider?: AgentWorkspaceSandbox["provider"];
  timeoutMs?: number;
}

export async function createEngentySandboxProvider(params: {
  client: EngentyCoreFileStorageClient | null;
  // Container env the caller owns (package-cache redirects for its binds).
  env?: Record<string, string>;
  // Extra writable layouts (e.g. tenant `/shared`) the loader stages locally.
  // Docker binds them into the container; all providers sync them.
  extraMounts?: SandboxExtraMount[];
  fileStorageAccess?: { coreBaseUrl: string; accessToken: string } | null;
  input: CreateEngentySandboxProviderInput;
  sandboxConfig?: SandboxFactoryConfig;
  /** The space's own egress hosts, beyond the proxy's shared list. */
  spaceComputerEgressHosts?: readonly string[];
  /** The space's reach setting; omitted inherits the host default. */
  spaceComputerNetwork?: SandboxNetworkTier;
  tenantId: string;
  workspaceFsMode: EngentyWorkspaceFsMode;
}): Promise<CreateEngentySandboxProviderResult> {
  // Resolve provider (env overrides declaration); fails loudly on unsupported.
  resolveSandboxProvider(params.sandboxConfig?.provider);
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

  const image = resolveSandboxDockerImage();
  // No browser endpoint in a machine's env, on purpose: a user's browser is
  // driven host-side in that user's name (PLAN-user-browser.md D2), and a
  // machine never shares a network with one.
  // A container boots on UTC, so an agent reading its own clock answers in UTC
  // and every "good evening" is off by the offset. The tenant's zone is the one
  // place that knows better; `TZ` is how `date` and `new Date()` learn it.
  // Caller-supplied env still wins — a caller naming TZ meant it.
  const timezoneEnv = await sandboxTimezoneEnv(params.tenantId);
  // The space computer's tier is the SPACE's call, never the declaring
  // agent's — see `resolveSpaceComputerNetworkTier` for why.
  const onSpaceComputer = params.sandboxConfig?.lifecycle === "space";
  const network = onSpaceComputer
    ? resolveSpaceComputerNetworkTier(params.spaceComputerNetwork)
    : (params.sandboxConfig?.network ?? "none");
  const spaceId = input.identity.spaceId;
  // A space computer names its Space at the proxy, which then adds the
  // Space's own hosts to the shared list.
  const proxyAuth =
    onSpaceComputer &&
    spaceId &&
    network === "egress" &&
    isSandboxEgressProxied()
      ? publishSpaceEgress({
          hosts: params.spaceComputerEgressHosts ?? [],
          spaceId,
          tenantId: params.tenantId,
        })
      : undefined;
  const { dockerSandbox, provider } = createDockerEngentySandboxPair({
    client: params.client,
    env: { ...timezoneEnv, ...params.env },
    extraMounts,
    image,
    input,
    mountPath,
    network,
    ...(proxyAuth ? { proxyAuth } : {}),
    tenantId: params.tenantId,
    useRemoteStorageSync,
  });
  return { mastraSandbox: dockerSandbox, provider };
}
