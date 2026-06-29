import type {
  AgentWorkspaceConfig,
  AgentWorkspaceMount,
} from "@engenty/ai-core";

const SANDBOX_MOUNT: AgentWorkspaceMount = {
  access: "rw",
  path: "/sandbox",
  scope: "sandbox",
  source: "sandbox",
};

export function ensureSandboxWorkspaceMounts(
  config: AgentWorkspaceConfig
): AgentWorkspaceMount[] {
  const mounts = config.mounts?.length ? [...config.mounts] : [];
  if (!config.sandbox?.enabled) {
    return mounts;
  }
  const mountPath = config.sandbox.mountPath ?? "/sandbox";
  const hasSandboxMount = mounts.some((mount) => mount.path === mountPath);
  if (hasSandboxMount) {
    return mounts;
  }
  return [
    ...mounts,
    {
      ...SANDBOX_MOUNT,
      path: mountPath,
    },
  ];
}

export function mergeDeclaredWorkspaceMounts(
  config: AgentWorkspaceConfig,
  expanded: AgentWorkspaceMount[]
): AgentWorkspaceMount[] {
  if (config.mounts?.length) {
    return ensureSandboxWorkspaceMounts({ ...config, mounts: config.mounts });
  }
  if (!config.sandbox?.enabled) {
    return expanded;
  }
  const mountPath = config.sandbox.mountPath ?? "/sandbox";
  if (expanded.some((mount) => mount.path === mountPath)) {
    return expanded;
  }
  return [
    ...expanded,
    {
      ...SANDBOX_MOUNT,
      path: mountPath,
    },
  ];
}
