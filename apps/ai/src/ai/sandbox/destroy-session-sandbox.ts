import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import { buildDockerSandboxId } from "./providers/docker-sandbox-provider.js";

// Session-lifecycle CLI sandboxes key containers by parent thread id
// (`engenty-session-<threadId>`). Tear down by label lookup so delete/close
// paths can kill containers without the run-scoped provider instance.
export function buildSessionLifecycleSandboxId(threadId: string): string {
  return buildDockerSandboxId({
    identity: {
      lifecycle: "session",
      runId: "teardown",
      tenantId: "teardown",
      threadId,
    },
    layout: {
      fileStorageRelativePath: "ai/sandboxes/session-teardown/workspace/",
      stagingPath: "/tmp/engenty-sandbox-teardown",
    },
    timeoutMs: 1,
  });
}

export async function destroySessionLifecycleSandbox(
  threadId: string
): Promise<void> {
  await destroyEngentySandboxById(buildSessionLifecycleSandboxId(threadId));
}
