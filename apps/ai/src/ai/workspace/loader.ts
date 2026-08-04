import { mkdirSync } from "node:fs";

import {
  LocalFilesystem,
  WORKSPACE_TOOLS,
  Workspace,
  type WorkspaceFilesystem,
  type WorkspaceSandbox,
  type WorkspaceToolsConfig,
} from "@mastra/core/workspace";

import { createEngentySandboxProvider } from "../sandbox/sandbox-factory.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { resolveSandboxStorageLayout } from "../sandbox/sandbox-storage-paths.js";
import type { SandboxExtraMount } from "../sandbox/sandbox-types.js";
import {
  type EngentyWorkspaceMountSpec,
  type EngentyWorkspaceRuntimeSpec,
  type EngentyWorkspaceRuntimeSpecInput,
  parseEngentyWorkspaceRuntimeSpec,
} from "./contracts.js";
import { createEngentyCoreFileStorageClient } from "./core-file-storage-client.js";
import { createWorkspaceMountFilesystem } from "./files-sdk-filesystem.js";
import { resolveLocalMountBasePath } from "./local-workspace-paths.js";
import {
  resolveEngentyWorkspaceFsMode,
  shouldUseRemoteWorkspaceSync,
} from "./workspace-fs-mode.js";
import {
  COMMONS_STORAGE_PREFIX,
  HOME_MOUNT_PATH,
} from "./workspace-presets.js";

export interface CreateEngentyAgentWorkspaceResult {
  // The single Mastra executor (DockerSandbox) attached to the Workspace; the
  // sandbox provider delegates command execution to it.
  mastraSandbox?: WorkspaceSandbox;
  sandboxProvider?: import("../sandbox/sandbox-provider.js").EngentySandboxProvider;
  skillDiscoveryPaths: string[];
  workspace: Workspace;
  workspaceFsMode: "remote" | "local";
}

// Writable, durable mounts unified with the sandbox staging mechanism: each is
// staged to a local dir, bind-mounted into the docker sandbox at its mount path,
// and synced to its own file-storage prefix at the run edges (syncIn/syncOut).
// Today these are tenant-shared commons (`/shared`) and the agent/user `/home`.
// (`/sandbox` is the sandbox layout itself; the read-only `/skills` mount and
// the `/task` checkout intentionally stay direct Files-SDK — see below.)
function isSyncedWritableMount(mount: EngentyWorkspaceMountSpec): boolean {
  if (mount.readOnly) {
    return false;
  }
  return (
    mount.fileStorageRelativePath === COMMONS_STORAGE_PREFIX ||
    mount.mountPath === HOME_MOUNT_PATH
  );
}

// Stage + bind + sync table for the writable durable mounts (commons, home).
// Returns the docker `extraMounts` (host bind + synced layout) and a
// `mountPath -> stagingPath` map so the mount filesystem can back onto the same
// local dir the container sees. Each mount uses its OWN storage prefix.
export function buildSyncedWritableMounts(
  mounts: EngentyWorkspaceMountSpec[],
  tenantId: string
): {
  extraMounts: SandboxExtraMount[];
  stagingByMountPath: Map<string, string>;
} {
  const extraMounts: SandboxExtraMount[] = [];
  const stagingByMountPath = new Map<string, string>();
  for (const mount of mounts) {
    if (!isSyncedWritableMount(mount)) {
      continue;
    }
    const stagingPath = resolveLocalMountBasePath(
      tenantId,
      mount.fileStorageRelativePath
    );
    stagingByMountPath.set(mount.mountPath, stagingPath);
    extraMounts.push({
      containerPath: mount.mountPath,
      layout: {
        fileStorageRelativePath: mount.fileStorageRelativePath,
        stagingPath,
      },
    });
  }
  return { extraMounts, stagingByMountPath };
}

function createMountFilesystem(
  spec: EngentyWorkspaceRuntimeSpec,
  mount: EngentyWorkspaceMountSpec,
  sandboxStagingPath?: string,
  stagingByMountPath?: Map<string, string>
): WorkspaceFilesystem {
  const isSandboxMount =
    sandboxStagingPath &&
    mount.mountPath === (spec.sandboxConfig?.mountPath ?? "/sandbox");

  // Sandbox + the synced writable mounts (`/shared`, `/home`) all back onto a
  // local staging dir so file tools and executed code (which sees the same dir
  // via bind/cwd) share live state; the sandbox provider syncs those dirs to
  // file storage at the edges.
  const localStagingPath = isSandboxMount
    ? sandboxStagingPath
    : stagingByMountPath?.get(mount.mountPath);

  if (localStagingPath) {
    mkdirSync(localStagingPath, { recursive: true });
    return new LocalFilesystem({
      basePath: localStagingPath,
    });
  }

  // Every other mount (read-only `/skills`, the `/task` checkout, or any mount
  // when no sandbox is enabled) is an object-store filesystem via Mastra's Files
  // SDK (Supabase Storage). Per-tenant key isolation comes from the Files `prefix`.
  return createWorkspaceMountFilesystem({
    fileStorageRelativePath: mount.fileStorageRelativePath,
    id: `mount-${mount.mountPath.replace(/\//g, "-")}`,
    readOnly: mount.readOnly,
    tenantId: spec.agentConfig.tenantId,
  });
}

/**
 * Builds a Mastra Workspace for an Engenty dynamic agent.
 * Sandbox mounts share a local staging directory synced with tenant file storage.
 */
export async function createEngentyAgentWorkspace(
  specInput: EngentyWorkspaceRuntimeSpecInput
): Promise<CreateEngentyAgentWorkspaceResult> {
  const spec = parseEngentyWorkspaceRuntimeSpec(specInput);
  // A workspace IS its mount table. Zero mounts used to fall back to a single
  // unscoped filesystem rooted at basePath — an agent silently getting a
  // broader view than its declaration granted. Callers resolve the table first
  // (buildEngentyMountSpecs) and skip the workspace entirely when it comes back
  // empty, so reaching here with none is a wiring bug, not a runtime state.
  if (spec.mounts.length === 0) {
    throw new Error(
      `createEngentyAgentWorkspace: agent "${spec.agentConfig.id}" resolved zero mounts — a workspace needs at least one`
    );
  }
  const workspaceFsMode = shouldUseRemoteWorkspaceSync({
    fileStorageAccess: spec.fileStorageAccess,
    mode: spec.workspaceFsMode ?? resolveEngentyWorkspaceFsMode(),
  })
    ? "remote"
    : "local";

  let sandboxProvider: EngentySandboxProvider | undefined;
  let sandboxStagingPath: string | undefined;
  let stagingByMountPath: Map<string, string> | undefined;
  let mastraSandbox: CreateEngentyAgentWorkspaceResult["mastraSandbox"];

  if (spec.enableSandbox && spec.sandboxIdentity) {
    const lifecycle = spec.sandboxConfig?.lifecycle ?? "run";
    const layout = resolveSandboxStorageLayout({
      lifecycle,
      runId: spec.sandboxIdentity.runId,
      taskIdentifier: spec.sandboxIdentity.taskIdentifier,
      tenantId: spec.sandboxIdentity.tenantId,
      threadId: spec.sandboxIdentity.threadId,
    });
    sandboxStagingPath = layout.stagingPath;

    // Writable durable mounts (`/shared`, `/home`) are staged locally so they can
    // be bound into the sandbox (docker) and synced to their own storage prefix.
    const synced = buildSyncedWritableMounts(
      spec.mounts,
      spec.sandboxIdentity.tenantId
    );
    stagingByMountPath = synced.stagingByMountPath;
    const extraMounts = synced.extraMounts;

    const client = spec.fileStorageAccess
      ? createEngentyCoreFileStorageClient(spec.fileStorageAccess)
      : null;
    const sandboxResult = await createEngentySandboxProvider({
      client,
      extraMounts,
      fileStorageAccess: spec.fileStorageAccess,
      input: {
        identity: {
          lifecycle,
          runId: spec.sandboxIdentity.runId,
          taskIdentifier: spec.sandboxIdentity.taskIdentifier,
          tenantId: spec.sandboxIdentity.tenantId,
          threadId: spec.sandboxIdentity.threadId,
        },
        layout,
        timeoutMs: spec.sandboxConfig?.timeoutMs ?? 120_000,
      },
      sandboxConfig: spec.sandboxConfig,
      tenantId: spec.sandboxIdentity.tenantId,
      workspaceFsMode,
    });
    sandboxProvider = sandboxResult.provider;
    mastraSandbox = sandboxResult.mastraSandbox;
    await sandboxProvider.syncIn();
  }

  // Explicit skill paths win (copilot points discovery at `/tenant-skills`).
  // Legacy task agents fall back to agent-config skill paths plus default `skills`.
  const skillDiscoveryPaths = spec.skillDiscoveryPaths
    ? [...new Set(spec.skillDiscoveryPaths)]
    : [
        ...new Set([
          ...spec.agentConfig.skillPaths,
          ...(spec.enableSkillSearch ? ["skills"] : []),
        ]),
      ];

  const mountFilesystems: Record<string, WorkspaceFilesystem> = {};
  for (const mount of spec.mounts) {
    mountFilesystems[mount.mountPath] = createMountFilesystem(
      spec,
      mount,
      sandboxStagingPath,
      stagingByMountPath
    );
  }

  // Sandbox is gated by HITL by default: `EXECUTE_COMMAND` requires approval,
  // which Mastra surfaces as a tool suspension the harness bridges to an AG-UI
  // interrupt. Set `sandbox.requireApproval: false` in the declaration to allow
  // unattended command execution.
  const sandboxTools: WorkspaceToolsConfig | undefined = spec.enableSandbox
    ? {
        [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
          requireApproval: spec.sandboxRequireApproval,
        },
      }
    : undefined;

  const workspace = new Workspace({
    // One shape for every agent: named mounts, no implicit `/` root. An agent
    // sees exactly what its mount table grants it — `/home`, `/skills`,
    // optionally `/shared`, `/task`, `/sandbox` — and nothing else.
    mounts: mountFilesystems,
    ...(spec.enableSandbox && mastraSandbox ? { sandbox: mastraSandbox } : {}),
    ...(sandboxTools ? { tools: sandboxTools } : {}),
    ...(spec.bm25 ? { bm25: spec.bm25 } : {}),
    skills: skillDiscoveryPaths,
  });

  return {
    mastraSandbox,
    sandboxProvider,
    skillDiscoveryPaths,
    workspace,
    workspaceFsMode,
  };
}

export async function initEngentyAgentWorkspace(
  specInput: EngentyWorkspaceRuntimeSpecInput
): Promise<CreateEngentyAgentWorkspaceResult> {
  const result = await createEngentyAgentWorkspace(specInput);
  await result.workspace.init();
  return result;
}
