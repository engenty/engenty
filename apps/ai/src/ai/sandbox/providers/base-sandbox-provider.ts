// Shared base for the Engenty Docker sandbox provider.
//
// Single-executor model: the provider wraps exactly one Mastra `MastraSandbox`
// (a `DockerSandbox`) and runs commands through its
// `executeCommand`. The SAME sandbox instance is attached to the Mastra
// `Workspace`, so the no-approval path (Mastra's `execute_command` tool) and the
// HITL resume path (`provider.runCommand`) execute through one engine with one
// env/cwd contract — no divergence.
//
// Storage sync is lifecycle-scoped: `syncIn` once at workspace init, `syncOut`
// once on teardown via `destroy()` — never per command.

import type { CommandResult, MastraSandbox } from "@mastra/core/workspace";

import type { EngentyCoreFileStorageClient } from "../../workspace/core-file-storage-client.js";
import { resolveSandboxMaxOutputBytes } from "../sandbox-env.js";
import type {
  CreateEngentySandboxProviderInput,
  EngentySandboxProvider,
} from "../sandbox-provider.js";
import {
  pullSandboxWorkspaceFromStorage,
  pushSandboxWorkspaceToStorage,
} from "../sandbox-sync.js";
import type {
  SandboxCommandRequest,
  SandboxCommandResult,
  SandboxStorageLayout,
} from "../sandbox-types.js";

export interface BaseSandboxProviderParams {
  client: EngentyCoreFileStorageClient | null;
  // Extra writable layouts to sync alongside the sandbox (e.g. tenant `/shared`).
  extraLayouts?: SandboxStorageLayout[];
  input: CreateEngentySandboxProviderInput;
  mountPath?: string;
  // The single Mastra executor; also attached to the Workspace by the loader.
  sandbox: MastraSandbox;
  tenantId: string;
  useRemoteStorageSync: boolean;
}

export abstract class BaseEngentySandboxProvider
  implements EngentySandboxProvider
{
  abstract readonly id: string;
  abstract readonly provider: "docker";
  protected readonly client: EngentyCoreFileStorageClient | null;
  protected readonly extraLayouts: SandboxStorageLayout[];
  protected readonly input: CreateEngentySandboxProviderInput;
  // The agent-visible sandbox mount root (e.g. `/sandbox`).
  protected readonly mountPath: string;
  protected readonly sandbox: MastraSandbox;
  protected readonly tenantId: string;
  protected readonly useRemoteStorageSync: boolean;

  constructor(params: BaseSandboxProviderParams) {
    this.client = params.client;
    this.extraLayouts = params.extraLayouts ?? [];
    this.input = params.input;
    this.mountPath = params.mountPath ?? "/sandbox";
    this.sandbox = params.sandbox;
    this.tenantId = params.tenantId;
    this.useRemoteStorageSync = params.useRemoteStorageSync;
  }

  getWorkingDirectory(): string {
    return this.input.layout.stagingPath;
  }

  // Map the agent's requested cwd (a `mountPath` subpath) onto the container's
  // filesystem (the container-absolute path under the bind-mounted mount path).
  protected abstract resolveCwd(cwd: string | undefined): string;

  async runCommand(
    request: SandboxCommandRequest
  ): Promise<SandboxCommandResult> {
    await this.sandbox.ensureRunning();
    const executeCommand = this.sandbox.executeCommand;
    if (!executeCommand) {
      return {
        exitCode: 1,
        stderr: "sandbox_execute_command_unavailable",
        stdout: "",
      };
    }
    const result: CommandResult = await executeCommand.call(
      this.sandbox,
      request.command,
      request.args,
      {
        cwd: this.resolveCwd(request.cwd),
        env: request.env,
        maxRetainedBytes: resolveSandboxMaxOutputBytes(),
        timeout: this.input.timeoutMs,
      }
    );
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      timedOut: result.timedOut,
    };
  }

  /**
   * Mounts that carry no storage prefix are BUCKET-EXEMPT by construction, not
   * misconfigured: the Space Data cache (workspace/loader.ts) flushes through
   * the operation pipeline instead. Syncing one anyway is harmful in both
   * directions — pulling throws `sandbox_sync_storage_prefix_empty`, and
   * pushing would write its records to the tenant root as loose objects.
   */
  private syncableLayouts(): SandboxStorageLayout[] {
    return [this.input.layout, ...this.extraLayouts].filter((layout) =>
      Boolean(layout.fileStorageRelativePath.trim())
    );
  }

  async syncIn(): Promise<void> {
    const client = this.client;
    if (!(client && this.useRemoteStorageSync)) {
      return;
    }
    for (const layout of this.syncableLayouts()) {
      await pullSandboxWorkspaceFromStorage({
        client,
        layout,
        tenantId: this.tenantId,
      });
    }
  }

  async syncOut(): Promise<void> {
    const client = this.client;
    if (!(client && this.useRemoteStorageSync)) {
      return;
    }
    for (const layout of this.syncableLayouts()) {
      await pushSandboxWorkspaceToStorage({
        client,
        layout,
        tenantId: this.tenantId,
      });
    }
  }

  async destroy(): Promise<void> {
    await this.syncOut();
  }
}
