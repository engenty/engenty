import type { AgentWorkspaceConfig } from "@engenty/ai-core";

export type AgentWorkspaceSandbox = NonNullable<
  AgentWorkspaceConfig["sandbox"]
>;

export interface SandboxCommandRequest {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SandboxCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  timedOut?: boolean;
}

export interface SandboxRunIdentity {
  lifecycle: "run" | "session" | "task";
  runId: string;
  taskIdentifier?: string;
  tenantId: string;
  threadId: string;
}

export interface SandboxStorageLayout {
  fileStorageRelativePath: string;
  stagingPath: string;
}

// An extra writable workspace dir (e.g. the tenant-shared `/shared`) that is
// staged locally, synced to its own storage prefix, and — for the docker
// provider — bind-mounted into the sandbox at `containerPath` so code can reach
// it. Distinct from the per-session sandbox layout in `CreateEngentySandboxProviderInput`.
export interface SandboxExtraMount {
  containerPath: string;
  layout: SandboxStorageLayout;
}
