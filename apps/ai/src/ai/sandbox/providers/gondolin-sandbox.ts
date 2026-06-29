// Gondolin micro-VM executor for the Engenty agent sandbox.
//
// Implements Mastra's `MastraSandbox` over a Gondolin Linux micro-VM (QEMU by
// default, krun opt-in). It is the Gondolin analog of `@mastra/docker`'s
// `DockerSandbox`: the SAME instance is attached to the Mastra `Workspace` (the
// no-approval `execute_command` path) and wrapped by the Engenty provider (the
// HITL resume path), so both routes share one engine and one cwd/env contract.
//
// The host staging dir is exposed inside the guest at `mountPath` via a
// `RealFSProvider` mount — the direct analog of the Docker volume bind — so the
// existing `syncIn`/`syncOut` storage model and absolute `/sandbox` cwds carry
// over unchanged.
//
// The `@earendil-works/gondolin` package is loaded lazily (dynamic import) so
// Docker deployments never pay for it and a missing optional native krun runner
// can't break module load.

// Type-only imports are erased at compile time — no runtime load of the package.
import type { ExecResult, VM, VMOptions } from "@earendil-works/gondolin";
import type {
  CommandResult,
  ExecuteCommandOptions,
} from "@mastra/core/workspace";
import { MastraSandbox } from "@mastra/core/workspace";

import {
  registerGondolinVm,
  unregisterGondolinVm,
} from "../gondolin-vm-registry.js";

// Extra host->guest mount (e.g. tenant `/shared`, `/home`): the host staging dir
// is exposed read-write at `guestPath`, mirroring the Docker bind mounts.
export interface GondolinExtraMount {
  guestPath: string;
  hostPath: string;
}

export interface GondolinSandboxOptions {
  backend: "qemu" | "krun";
  extraMounts?: GondolinExtraMount[];
  // Stable id keyed by lifecycle scope (mirrors the Docker sandbox id).
  id: string;
  // Agent-visible mount root for the sandbox staging dir (e.g. `/sandbox`).
  mountPath: string;
  // Host staging dir bound into the guest at `mountPath`.
  stagingPath: string;
  // Per-command wall-clock timeout (ms).
  timeoutMs: number;
}

// Cap retained output to mirror Mastra's `maxRetainedBytes` (keep the newest
// bytes). Gondolin buffers the full output, so we truncate after the fact.
function clampOutput(
  value: string,
  maxRetainedBytes: number | undefined
): { text: string; truncated: boolean } {
  if (
    maxRetainedBytes === undefined ||
    maxRetainedBytes === Number.POSITIVE_INFINITY
  ) {
    return { text: value, truncated: false };
  }
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxRetainedBytes) {
    return { text: value, truncated: false };
  }
  const kept = bytes.subarray(bytes.length - maxRetainedBytes).toString("utf8");
  return { text: kept, truncated: true };
}

export class GondolinSandbox extends MastraSandbox {
  readonly id: string;
  readonly name = "Gondolin";
  readonly provider = "gondolin";
  status: MastraSandbox["status"] = "pending";

  private readonly opts: GondolinSandboxOptions;
  private vm: VM | null = null;

  constructor(opts: GondolinSandboxOptions) {
    super({ name: "Gondolin" });
    this.opts = opts;
    this.id = opts.id;
  }

  // Called by the base-class `_start()` (via `ensureRunning()`). Boots the VM
  // and mounts the host staging dir + extra mounts into the guest.
  async start(): Promise<void> {
    if (this.vm) {
      return;
    }
    const { RealFSProvider, VM } = await import("@earendil-works/gondolin");
    const mounts: Record<string, InstanceType<typeof RealFSProvider>> = {
      [this.opts.mountPath]: new RealFSProvider(this.opts.stagingPath),
    };
    for (const extra of this.opts.extraMounts ?? []) {
      mounts[extra.guestPath] = new RealFSProvider(extra.hostPath);
    }
    const vmOptions: VMOptions = {
      sandbox: { vmm: this.opts.backend },
      sessionLabel: this.opts.id,
      vfs: { mounts },
    };
    this.vm = await VM.create(vmOptions);
    registerGondolinVm(this.vm);
  }

  async stop(): Promise<void> {
    await this.closeVm();
  }

  async destroy(): Promise<void> {
    await this.closeVm();
  }

  private async closeVm(): Promise<void> {
    const vm = this.vm;
    if (!vm) {
      return;
    }
    this.vm = null;
    unregisterGondolinVm(vm);
    await vm.close();
  }

  // Run a shell command and wait for completion. Mirrors `DockerSandbox`, which
  // runs `["sh", "-c", command]` and folds any `args` into the shell string.
  async executeCommand(
    command: string,
    args?: string[],
    options?: ExecuteCommandOptions
  ): Promise<CommandResult> {
    await this.ensureRunning();
    const vm = this.vm;
    if (!vm) {
      return {
        args,
        command,
        exitCode: 1,
        executionTimeMs: 0,
        stderr: "gondolin_vm_unavailable",
        stdout: "",
        success: false,
      };
    }

    const shellCommand =
      args && args.length > 0 ? `${command} ${args.join(" ")}` : command;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.abortSignal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timeoutMs = options?.timeout ?? this.opts.timeoutMs;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;

    const startedAt = Date.now();
    try {
      const result: ExecResult = await vm.exec(
        ["/bin/sh", "-c", shellCommand],
        {
          cwd: options?.cwd,
          env: this.resolveEnv(options?.env),
          signal: controller.signal,
          stderr: "buffer",
          stdout: "buffer",
        }
      );
      const stdout = clampOutput(result.stdout, options?.maxRetainedBytes);
      const stderr = clampOutput(result.stderr, options?.maxRetainedBytes);
      return {
        args,
        command,
        exitCode: result.exitCode,
        executionTimeMs: Date.now() - startedAt,
        stderr: stderr.text,
        stderrTruncated: stderr.truncated,
        stdout: stdout.text,
        stdoutTruncated: stdout.truncated,
        success: result.exitCode === 0,
        timedOut,
      };
    } catch (err) {
      // An abort (timeout or caller cancel) surfaces as a rejection.
      return {
        args,
        command,
        exitCode: timedOut ? 124 : 1,
        executionTimeMs: Date.now() - startedAt,
        killed: !timedOut,
        stderr: err instanceof Error ? err.message : String(err),
        stdout: "",
        success: false,
        timedOut,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      options?.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  // Drop undefined values so Gondolin (Record<string,string>) accepts the env,
  // matching how the Docker provider filters its env array.
  private resolveEnv(
    env: ExecuteCommandOptions["env"]
  ): Record<string, string> | undefined {
    if (!env) {
      return;
    }
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        resolved[key] = value;
      }
    }
    return resolved;
  }
}
