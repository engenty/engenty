import type {
  SandboxCommandRequest,
  SandboxCommandResult,
  SandboxRunIdentity,
  SandboxStorageLayout,
} from "./sandbox-types.js";

export interface EngentySandboxProvider {
  destroy(): Promise<void>;
  getWorkingDirectory(): string;
  readonly id: string;
  readonly provider: "docker";
  runCommand(request: SandboxCommandRequest): Promise<SandboxCommandResult>;
  syncIn(): Promise<void>;
  syncOut(): Promise<void>;
}

export interface CreateEngentySandboxProviderInput {
  identity: SandboxRunIdentity;
  layout: SandboxStorageLayout;
  timeoutMs: number;
}

export interface EngentySandboxProviderFactory {
  create(
    input: CreateEngentySandboxProviderInput
  ): Promise<EngentySandboxProvider>;
}
