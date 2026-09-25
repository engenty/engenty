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
  /**
   * The agent the sandbox belongs to. Part of the `session` identity so a
   * parent and its sub-agent get their own containers rather than sharing one
   * whose HostConfig was fixed by whichever started first.
   */
  agentId: string;
  lifecycle: "run" | "session" | "task" | "space";
  runId: string;
  /**
   * Space the run is bound to, when it is bound to one.
   *
   * The sandbox's scratch is a space-scoped cache like every other work mount
   * — rooting it per space keeps two spaces of the same tenant
   * from sharing a staging dir, and gives the admission ceiling a per-space
   * dimension.
   */
  spaceId?: string;
  taskIdentifier?: string;
  tenantId: string;
  threadId: string;
}

export interface SandboxStorageLayout {
  fileStorageRelativePath: string;
  /**
   * Space this mount's bytes belong to, when it is space-rooted
   * Two spaces' commons share the identical relative path, so
   * syncing without it would push one space's files into another's prefix.
   */
  spaceId?: string;
  stagingPath: string;
}

// An extra workspace dir (e.g. the Space's `/space`) that is
// staged locally, synced to its own storage prefix, and — for the docker
// provider — bind-mounted into the sandbox at `containerPath` so code can reach
// it. Distinct from the per-session sandbox layout in `CreateEngentySandboxProviderInput`.
export interface SandboxExtraMount {
  containerPath: string;
  layout: SandboxStorageLayout;
  /**
   * Bound `:ro`. For what the shell may read but only something else may
   * write: the `/company` copy, and `/space/public`, which file tools write
   * behind an approval.
   */
  readOnly?: boolean;
}
