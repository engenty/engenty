import {
  createDockerSandboxInstance,
  DEFAULT_DOCKER_SANDBOX_MOUNT_PATH,
} from "./providers/docker-sandbox-provider.js";
import { resolveSandboxDockerImage } from "./sandbox-env.js";

// Tear down a Mastra-labelled container by sandbox id (`engenty-session-<thread>`).
export async function destroyEngentySandboxById(
  sandboxId: string
): Promise<void> {
  const dockerSandbox = createDockerSandboxInstance({
    id: sandboxId,
    image: resolveSandboxDockerImage(),
    workingDir: DEFAULT_DOCKER_SANDBOX_MOUNT_PATH,
  });
  await dockerSandbox.destroy();
}
