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
  if (input.keepParentSandboxAlive) {
    // The run PARKED on an HITL suspend rather than ending: the parked Session's
    // Workspace still holds THIS sandbox instance, and a Mastra sandbox cannot be
    // revived once torn down — `_destroy()` latches `status = "destroyed"` and
    // every later `ensureRunning()` throws SandboxNotReadyError (it does not even
    // reach Docker, so no container is created and none shows in `docker ps -a`).
    // Container-id keying (`engenty-session-<threadId>`) reconnects a NEW
    // instance to the same container; it cannot rescue a poisoned one.
    //
    // So persist the staged workspace here but leave the instance usable. The
    // park owns the eventual teardown (resume completion or TTL expiry) — see
    // `disposeParkedSessionRun` in ../conversation/session-park.ts.
    await input.sandboxProvider?.syncOut().catch(() => undefined);
  } else {
    await input.sandboxProvider?.destroy().catch(() => undefined);
  }
  // Sub-agent sandboxes (e.g. engenty.cli) are never kept alive across turns —
  // parent HITL interrupts must not leave CLI docker containers running.
  await destroySubAgentSandboxes(input.subAgentSandboxProviders);
}
