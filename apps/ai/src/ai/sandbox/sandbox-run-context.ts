import { AsyncLocalStorage } from "node:async_hooks";

import type { EngentySandboxProvider } from "./sandbox-provider.js";
import type {
  SandboxCommandRequest,
  SandboxCommandResult,
} from "./sandbox-types.js";

export interface EngentySandboxRunContext {
  executeApprovedCommand(
    request: SandboxCommandRequest
  ): Promise<SandboxCommandResult>;
  provider: EngentySandboxProvider;
}

const sandboxRunAls = new AsyncLocalStorage<EngentySandboxRunContext>();

export function runWithEngentySandboxContext<T>(
  context: EngentySandboxRunContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return sandboxRunAls.run(context, fn);
}

export function getEngentySandboxRunContext(): EngentySandboxRunContext | null {
  return sandboxRunAls.getStore() ?? null;
}

export async function executeEngentySandboxCommand(
  request: SandboxCommandRequest
): Promise<SandboxCommandResult> {
  const context = getEngentySandboxRunContext();
  if (!context) {
    throw new Error("sandbox_run_context_missing");
  }
  return context.executeApprovedCommand(request);
}
