import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  LocalFilesystem,
  WORKSPACE_TOOLS,
  Workspace,
  type WorkspaceFilesystem,
  type WorkspaceSandbox,
  type WorkspaceToolsConfig,
} from "@mastra/core/workspace";

import type { Files } from "files-sdk";
import { createEngentySandboxProvider } from "../sandbox/sandbox-factory.js";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
import { resolveSandboxStorageLayout } from "../sandbox/sandbox-storage-paths.js";
import type { SandboxExtraMount } from "../sandbox/sandbox-types.js";
import {
  resolveUserBrowserDownloadsPath,
  USER_BROWSER_DOWNLOADS_MOUNT_PATH,
} from "../sandbox/space-browser.js";
import { isSkillWorkspaceMount } from "./allowed-skills.js";
import {
  type EngentyWorkspaceMountSpec,
  type EngentyWorkspaceRuntimeSpec,
  type EngentyWorkspaceRuntimeSpecInput,
  parseEngentyWorkspaceRuntimeSpec,
} from "./contracts.js";
import { createEngentyCoreFileStorageClient } from "./core-file-storage-client.js";
import {
  createSpaceDataFilesClient,
  createSpaceDataMountFilesystem,
  createWorkspaceMountFilesystem,
} from "./files-sdk-filesystem.js";
import { wrapSkillFilesystem } from "./filtered-skill-filesystem.js";
import {
  resolveLocalMountBasePath,
  resolveSandboxCachePaths,
  resolveSpaceDrivePath,
  SANDBOX_CACHE_TOOLS,
  type SandboxCacheTool,
} from "./local-workspace-paths.js";
import {
  flushSpaceData,
  materializeSpaceData,
  type SpaceDataStagingManifest,
  spaceDataStagingExists,
} from "./space-data-staging.js";
import {
  resolveEngentyWorkspaceFsMode,
  shouldUseRemoteWorkspaceSync,
} from "./workspace-fs-mode.js";
import {
  COMMONS_STORAGE_PREFIX,
  HOME_MOUNT_PATH,
} from "./workspace-presets.js";
import {
  sandboxExecuteApprovalGate,
  workspaceDeleteApprovalGate,
} from "./workspace-tool-guards.js";

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
// Today these are the shared commons (`/shared`, or `/space` for a confined
// agent — same relative path, different root) and the agent/user `/home`.
// (`/sandbox` is the sandbox layout itself; the read-only `/skills` mount and
// the `/task` checkout intentionally stay direct Files-SDK — see below.)
// Where the package caches land inside the container, and the variable each
// tool reads to find its own. The host owns both halves so a custom sandbox
// image cannot silently leave the binds inert.
const SANDBOX_CACHE_MOUNT_ROOT = "/cache";
/** Where a space computer sees the space's Apps. */
const SPACE_APPS_MOUNT_PATH = "/sandbox/apps";

const SANDBOX_CACHE_ENV_VARS: Record<SandboxCacheTool, string> = {
  bun: "BUN_INSTALL_CACHE_DIR",
  npm: "npm_config_cache",
  uv: "UV_CACHE_DIR",
};

function isSyncedWritableMount(mount: EngentyWorkspaceMountSpec): boolean {
  if (mount.readOnly) {
    return false;
  }
  return (
    mount.fileStorageRelativePath === COMMONS_STORAGE_PREFIX ||
    mount.mountPath === HOME_MOUNT_PATH
  );
}

// A space computer is ONE container for every run in the Space, and Docker
// fixes its binds when the first run creates it — Mastra reconnects by label
// and only warns on a HostConfig mismatch. A bind whose source depends on the
// run (the agent's or person's `/home`) would be whoever came first: another
// agent's desk, readable and writable from this run's shell. So on a space
// computer `/home` is not bound; it stays a direct Files-SDK mount, reachable
// with file tools only.
function isRunScopedMount(mount: EngentyWorkspaceMountSpec): boolean {
  return mount.mountPath === HOME_MOUNT_PATH;
}

type SandboxLifecycle = "run" | "session" | "task" | "space";

/**
 * Whether a mount is bound into the run's container — reachable from its
 * commands — rather than a file-tools-only mount. The binds below and the
 * run's "Your computer" prompt both read this, so the prompt cannot name a
 * path the shell does not have.
 */
export function isMountBoundIntoSandbox(
  mount: EngentyWorkspaceMountSpec,
  lifecycle?: SandboxLifecycle
): boolean {
  if (mount.kind === "data") {
    // `/data` on a space computer: see the staging comment below.
    return lifecycle !== "space" && Boolean(mount.spaceId);
  }
  if (!isSyncedWritableMount(mount)) {
    return false;
  }
  return !(lifecycle === "space" && isRunScopedMount(mount));
}

// Stage + bind + sync table for the writable durable mounts (commons, home).
// Returns the docker `extraMounts` (host bind + synced layout) and a
// `mountPath -> stagingPath` map so the mount filesystem can back onto the same
// local dir the container sees. Each mount uses its OWN storage prefix.
export function buildSyncedWritableMounts(
  mounts: EngentyWorkspaceMountSpec[],
  tenantId: string,
  lifecycle?: SandboxLifecycle
): {
  extraMounts: SandboxExtraMount[];
  stagingByMountPath: Map<string, string>;
} {
  const extraMounts: SandboxExtraMount[] = [];
  const stagingByMountPath = new Map<string, string>();
  for (const mount of mounts) {
    if (mount.kind === "data" || !isMountBoundIntoSandbox(mount, lifecycle)) {
      continue;
    }
    const stagingPath = resolveLocalMountBasePath(
      tenantId,
      mount.fileStorageRelativePath,
      mount.spaceId
    );
    stagingByMountPath.set(mount.mountPath, stagingPath);
    extraMounts.push({
      containerPath: mount.mountPath,
      layout: {
        fileStorageRelativePath: mount.fileStorageRelativePath,
        stagingPath,
        ...(mount.spaceId ? { spaceId: mount.spaceId } : {}),
      },
    });
  }
  return { extraMounts, stagingByMountPath };
}

interface SpaceDataStagingBinding {
  files: Files;
  manifest: SpaceDataStagingManifest;
  stagingPath: string;
}

/**
 * Give the sandbox provider the `/data` cache's two edges.
 *
 * A DECORATOR rather than a change to the provider, because the provider's job
 * is object-storage sync and this is not that: the flush runs module UPDATE
 * operations, with their capability checks, approval gates and audit rows. The
 * two happen to share a lifecycle, and nothing else.
 *
 * `syncOut` never throws. A conflicted flush is a real outcome the run should
 * survive — the records are unchanged, which is exactly what a 409 is FOR —
 * and letting it take the teardown down with it would strand the sandbox.
 */
function wrapProviderWithSpaceDataStaging(
  provider: EngentySandboxProvider,
  binding: SpaceDataStagingBinding
): EngentySandboxProvider {
  return {
    destroy: () => provider.destroy(),
    getWorkingDirectory: () => provider.getWorkingDirectory(),
    id: provider.id,
    provider: provider.provider,
    runCommand: (request) => provider.runCommand(request),
    async syncIn() {
      await provider.syncIn();
      try {
        binding.manifest = await materializeSpaceData({
          files: binding.files,
          stagingPath: binding.stagingPath,
        });
      } catch {
        // A tree that could not be staged leaves `/data` empty in the sandbox,
        // which is the same thing an unmounted module looks like. The run
        // continues; `engenty_tool_execute` still reaches the records.
      }
    },
    async syncOut() {
      if (await spaceDataStagingExists(binding.stagingPath)) {
        await flushSpaceData({
          files: binding.files,
          manifest: binding.manifest,
          stagingPath: binding.stagingPath,
        }).catch(() => undefined);
      }
      await provider.syncOut();
    },
  };
}

function createMountFilesystem(
  spec: EngentyWorkspaceRuntimeSpec,
  mount: EngentyWorkspaceMountSpec,
  sandboxStagingPath?: string,
  stagingByMountPath?: Map<string, string>
): WorkspaceFilesystem | null {
  // The `/data` mount has no bytes at rest, so it is neither staged nor keyed:
  // it serves the space's module records through core's data endpoints, as the
  // run's principal. Without core access it is DROPPED
  // rather than mounted empty — an empty `/data` would read to the agent as
  // "this space has no contacts", which is a lie it would act on.
  if (mount.kind === "data") {
    if (!(spec.fileStorageAccess && mount.spaceId)) {
      return null;
    }
    return createSpaceDataMountFilesystem({
      accessToken: spec.fileStorageAccess.accessToken,
      coreBaseUrl: spec.fileStorageAccess.coreBaseUrl,
      id: `mount-${mount.mountPath.replace(/\//g, "-")}`,
      readOnly: mount.readOnly ?? false,
      spaceId: mount.spaceId,
      ...(spec.coreAgentId ? { agentId: spec.coreAgentId } : {}),
    });
  }

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
    ...(mount.spaceId ? { spaceId: mount.spaceId } : {}),
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
  let dataStaging: SpaceDataStagingBinding | undefined;

  if (spec.enableSandbox && spec.sandboxIdentity) {
    const lifecycle = spec.sandboxConfig?.lifecycle ?? "run";
    const layout = resolveSandboxStorageLayout({
      agentId: spec.agentConfig.id,
      lifecycle,
      runId: spec.sandboxIdentity.runId,
      spaceId: spec.sandboxIdentity.spaceId,
      taskIdentifier: spec.sandboxIdentity.taskIdentifier,
      tenantId: spec.sandboxIdentity.tenantId,
      threadId: spec.sandboxIdentity.threadId,
    });
    sandboxStagingPath = layout.stagingPath;

    // Writable durable mounts (`/shared`, `/home`) are staged locally so they can
    // be bound into the sandbox (docker) and synced to their own storage prefix.
    const synced = buildSyncedWritableMounts(
      spec.mounts,
      spec.sandboxIdentity.tenantId,
      lifecycle
    );
    stagingByMountPath = synced.stagingByMountPath;
    const extraMounts = synced.extraMounts;

    // `/data` inside the sandbox. A program cannot
    // speak HTTP to the data plane through a bind mount, so the tree is staged
    // as a read-through cache at the run's edges. The staging dir sits in the
    // sandbox's own scratch, NOT under a space prefix: for agent byte-mounts
    // the prefix IS access (§1c), so materialised records there would be a hole
    // in the boundary this design exists to create.
    //
    // Not on a space computer: its scratch is the Space's, bound once for
    // every run, while the tree is materialised as THIS run's principal and
    // flushed against this run's manifest. Another person's run would read
    // records it cannot see (materialising never deletes), clobber unflushed
    // edits, or flush someone else's edit under its own approvals. There
    // `/data` stays the direct adapter — file tools only, as `/home`.
    const dataMount = spec.mounts.find((mount) => mount.kind === "data");
    if (
      dataMount?.spaceId &&
      spec.fileStorageAccess &&
      isMountBoundIntoSandbox(dataMount, lifecycle)
    ) {
      dataStaging = {
        files: createSpaceDataFilesClient({
          accessToken: spec.fileStorageAccess.accessToken,
          coreBaseUrl: spec.fileStorageAccess.coreBaseUrl,
          spaceId: dataMount.spaceId,
          ...(spec.coreAgentId ? { agentId: spec.coreAgentId } : {}),
        }),
        manifest: new Map(),
        stagingPath: join(layout.stagingPath, "..", "data"),
      };
      extraMounts.push({
        containerPath: dataMount.mountPath,
        layout: {
          // No storage prefix: this cache is flushed through the operation
          // pipeline on syncOut, never synced to a bucket. An empty relative
          // path would make the sandbox's own sync try to upload records as
          // objects, which is the thing that must not happen.
          fileStorageRelativePath: "",
          stagingPath: dataStaging.stagingPath,
        },
      });
    }

    // The space's Apps: every App's source repository and /data directory,
    // bound in at /sandbox/apps/<slug>/{src,data} so the agent edits the same
    // files the running App reads. app-host owns the tree (it commits and
    // deploys from it); the machine only binds it. Empty storage prefix, so
    // the sandbox's own sync never uploads a repository to object storage.
    if (lifecycle === "space" && spec.sandboxIdentity.spaceId) {
      // This Space's browser downloads, bound read-write so a file its
      // browser saved is the same byte the machine reads under
      // /sandbox/browser-downloads. Empty storage prefix: the bytes are the
      // browser's, never synced to object storage by the sandbox.
      extraMounts.push({
        containerPath: USER_BROWSER_DOWNLOADS_MOUNT_PATH,
        layout: {
          fileStorageRelativePath: "",
          stagingPath: resolveUserBrowserDownloadsPath({
            spaceId: spec.sandboxIdentity.spaceId,
            tenantId: spec.sandboxIdentity.tenantId,
          }),
        },
      });
      extraMounts.push({
        containerPath: SPACE_APPS_MOUNT_PATH,
        layout: {
          fileStorageRelativePath: "",
          stagingPath: resolveSpaceDrivePath(
            spec.sandboxIdentity.tenantId,
            spec.sandboxIdentity.spaceId,
            "apps"
          ),
        },
      });
    }

    // Package caches: bound in so a second `uv pip install` in the same space
    // is a cache hit, and given an EMPTY storage prefix so the sandbox's own
    // sync never uploads a downloaded wheel to object storage. Same exemption
    // the `/data` cache uses, for the same reason.
    const cacheEnv: Record<string, string> = {};
    const cachePaths = resolveSandboxCachePaths(
      spec.sandboxIdentity.tenantId,
      spec.sandboxIdentity.spaceId
    );
    for (const tool of SANDBOX_CACHE_TOOLS) {
      const containerPath = `${SANDBOX_CACHE_MOUNT_ROOT}/${tool}`;
      extraMounts.push({
        containerPath,
        layout: {
          fileStorageRelativePath: "",
          stagingPath: cachePaths[tool],
        },
      });
      cacheEnv[SANDBOX_CACHE_ENV_VARS[tool]] = containerPath;
    }

    const client = spec.fileStorageAccess
      ? createEngentyCoreFileStorageClient(spec.fileStorageAccess)
      : null;
    const sandboxResult = await createEngentySandboxProvider({
      client,
      env: cacheEnv,
      extraMounts,
      fileStorageAccess: spec.fileStorageAccess,
      input: {
        identity: {
          agentId: spec.agentConfig.id,
          lifecycle,
          runId: spec.sandboxIdentity.runId,
          spaceId: spec.sandboxIdentity.spaceId,
          taskIdentifier: spec.sandboxIdentity.taskIdentifier,
          tenantId: spec.sandboxIdentity.tenantId,
          threadId: spec.sandboxIdentity.threadId,
        },
        layout,
        timeoutMs: spec.sandboxConfig?.timeoutMs ?? 120_000,
      },
      sandboxConfig: spec.sandboxConfig,
      ...(spec.spaceComputerNetwork
        ? { spaceComputerNetwork: spec.spaceComputerNetwork }
        : {}),
      ...(spec.spaceComputerEgressHosts
        ? { spaceComputerEgressHosts: spec.spaceComputerEgressHosts }
        : {}),
      tenantId: spec.sandboxIdentity.tenantId,
      workspaceFsMode,
    });
    sandboxProvider = dataStaging
      ? wrapProviderWithSpaceDataStaging(sandboxResult.provider, dataStaging)
      : sandboxResult.provider;
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
    const filesystem = createMountFilesystem(
      spec,
      mount,
      sandboxStagingPath,
      stagingByMountPath
    );
    if (filesystem) {
      const skillFilter =
        spec.allowedSkillNames !== undefined && isSkillWorkspaceMount(mount)
          ? wrapSkillFilesystem(filesystem, spec.allowedSkillNames)
          : filesystem;
      mountFilesystems[mount.mountPath] = skillFilter;
    }
  }

  // Sandbox is gated by HITL by default: `EXECUTE_COMMAND` requires approval,
  // which Mastra surfaces as a tool suspension — an AG-UI interrupt in a chat,
  // and a `needs_approval` park headless. The gate is grants-aware, so an
  // approval carries into the re-dispatch instead of asking again. Set
  // `sandbox.requireApproval: false` in the declaration to allow unattended
  // command execution outright.
  //
  // DELETE gets the same treatment and did not have it (P1.6): Mastra ships
  // `mastra_workspace_delete` ungated WITH a `recursive` flag, so one call
  // could empty a prefix of `/shared`. The gate is dynamic — it sees the call's
  // args, so the agent tidying a file in its own `/home` is not asked, while
  // anything recursive, shared, or in `/data` is. `files.requireApproval` in
  // the declaration can force the strict answer for every call.
  const workspaceTools: WorkspaceToolsConfig = {
    ...(spec.enableSandbox
      ? {
          [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
            requireApproval: spec.sandboxRequireApproval
              ? sandboxExecuteApprovalGate(
                  WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND
                )
              : false,
          },
        }
      : {}),
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      requireApproval:
        spec.filesRequireApproval === true
          ? true
          : workspaceDeleteApprovalGate(WORKSPACE_TOOLS.FILESYSTEM.DELETE),
    },
    // A tool the archetype will never call still ships its JSON Schema on every
    // model call. Mastra's per-tool `enabled` is the supported way off.
    ...Object.fromEntries(
      spec.disabledWorkspaceTools.map((name) => [name, { enabled: false }])
    ),
  };

  const workspace = new Workspace({
    // One shape for every agent: named mounts, no implicit `/` root. An agent
    // sees exactly what its mount table grants it — `/home`, `/skills`,
    // optionally `/shared`, `/task`, `/sandbox` — and nothing else.
    mounts: mountFilesystems,
    ...(spec.enableSandbox && mastraSandbox ? { sandbox: mastraSandbox } : {}),
    tools: workspaceTools,
    ...(spec.bm25 ? { bm25: spec.bm25 } : {}),
    skills: skillDiscoveryPaths,
  });

  return {
    mastraSandbox,
    sandboxProvider,
    skillDiscoveryPaths,
    // Mastra 1.55: mounts widen TMounts; result type uses the default Workspace.
    workspace: workspace as unknown as Workspace,
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
