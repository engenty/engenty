import type { EngentySandboxProvider } from "./sandbox-provider.js";

export async function destroySubAgentSandboxes(
  providers: readonly EngentySandboxProvider[]
): Promise<void> {
  for (const provider of providers) {
    await provider.destroy().catch(() => undefined);
  }
}

export async function destroyRunSandboxes(input: {
  keepParentSandboxAlive: boolean;
  sandboxProvider?: EngentySandboxProvider;
  subAgentSandboxProviders: readonly EngentySandboxProvider[];
}): Promise<void> {
  if (!input.keepParentSandboxAlive) {
    await input.sandboxProvider?.destroy().catch(() => undefined);
  }
  // Sub-agent sandboxes (e.g. engenty.cli) are never kept alive across turns —
  // parent HITL interrupts must not leave CLI docker containers running.
  await destroySubAgentSandboxes(input.subAgentSandboxProviders);
}
