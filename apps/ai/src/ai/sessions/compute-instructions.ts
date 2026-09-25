// The run's "Your computer" prompt section. The model cannot see its own
// HostConfig, so without this it guesses where to install, which paths its
// shell has and whether anything survives the run — a network-none specialist
// retries `pip install` forever, and a bot on a space computer asks where a
// CLI should go and who else sees it.

import { USER_BROWSER_DOWNLOADS_MOUNT_PATH } from "../sandbox/space-browser.js";
import type { EngentyWorkspaceMountSpec } from "../workspace/contracts.js";
import { isMountBoundIntoSandbox } from "../workspace/loader.js";
import {
  isCompanyMountPath,
  SPACE_MOUNT_PATH,
} from "../workspace/workspace-presets.js";

export interface ComputeInstructionsInput {
  lifecycle: "run" | "session" | "task" | "space";
  /** The run's mount table — split into shell-reachable and file-tools-only. */
  mounts: readonly EngentyWorkspaceMountSpec[];
  network: string;
}

const TOOLCHAIN = "node, bun, python3, uv, jq";

export function buildComputeInstructions(
  input: ComputeInstructionsInput
): string {
  const onSpaceComputer = input.lifecycle === "space";
  const hasCompanyView = input.mounts.some((mount) =>
    isCompanyMountPath(mount.mountPath)
  );
  const bound = [
    ...input.mounts
      .filter(
        (mount) =>
          !isCompanyMountPath(mount.mountPath) &&
          isMountBoundIntoSandbox(mount, input.lifecycle)
      )
      .map((mount) => mount.mountPath),
    // One entry, however many Spaces publish.
    ...(hasCompanyView ? ["/company (read-only)"] : []),
  ];
  const fileToolsOnly = input.mounts
    .filter((mount) => !isMountBoundIntoSandbox(mount, input.lifecycle))
    .map((mount) => mount.mountPath);
  const reach = onSpaceComputer
    ? [
        ...bound,
        "/sandbox/apps (the Space's Apps)",
        `${USER_BROWSER_DOWNLOADS_MOUNT_PATH} (what the Space's browser saved)`,
      ]
    : bound;

  return [
    "## Your computer",
    executionLine(input.lifecycle),
    // A shell command is an approval card with raw shell in it; the person
    // should see one only after asking for technical work. The how-to
    // (installs, CLI sign-in, scripted catalog calls) lives in the skill.
    "- Only for work we can't accomplish via operations or tools. Use if the person asked for (code, scripts, data " +
      "processing, a CLI): load **sandbox-code-execution** first. Never for " +
      "today's date (it is in your run context), Engenty records, Apps, " +
      "agents or settings (your tools), or web lookups (web_search / " +
      "web_fetch). Every command is shown to the person as raw shell.",
    `- Your commands start in /sandbox${
      reach.length > 0 ? ` and also reach ${reach.join(", ")}` : ""
    }.`,
    ...(hasCompanyView ? [companyLine(input.mounts)] : []),
    ...(fileToolsOnly.length > 0
      ? [
          `- Not on this computer, file tools only: ${fileToolsOnly.join(", ")}. ` +
            "Copy a file to /sandbox to run it.",
        ]
      : []),
    onSpaceComputer
      ? "- $HOME (/opt/sandbox) and /sandbox persist and are shared with the " +
        "Space's other agents."
      : "- Nothing on this computer outlasts it — $HOME is a small scratch. " +
        "Anything worth keeping goes to your mounted folders.",
    networkLine(input.network),
  ].join("\n");
}

/**
 * Where the company's files are, and the two ways to add to them — both of
 * which stop for a person, which is why the shell cannot do either.
 */
function companyLine(mounts: readonly EngentyWorkspaceMountSpec[]): string {
  const hasSpace = mounts.some((mount) => mount.mountPath === SPACE_MOUNT_PATH);
  return (
    "- /company is read-only: /company/files is the company drive, " +
    "/company/spaces/<key>/ what each Space published, /company/apps/<slug>/ " +
    "the source of those Spaces' Apps (change an App from its own Space). " +
    "To add to the drive " +
    "call company_files_publish (someone allowed to publish approves it)." +
    (hasSpace
      ? " To share from this Space, write to /space/public with the file " +
        "tools — the person approves it; the shell sees it read-only."
      : "")
  );
}

function executionLine(lifecycle: ComputeInstructionsInput["lifecycle"]) {
  switch (lifecycle) {
    case "space":
      return (
        `- Execution: this Space's computer (${TOOLCHAIN}), shared with its ` +
        "other agents. Another Space has another computer."
      );
    case "session":
      return `- Execution: this conversation's sandbox (${TOOLCHAIN}), kept for the conversation.`;
    case "task":
      return `- Execution: this task's sandbox (${TOOLCHAIN}), kept for the task.`;
    default:
      return (
        `- Execution: a per-run sandbox (${TOOLCHAIN}). Created on your ` +
        "first command, destroyed when the run ends."
      );
  }
}

function networkLine(network: string): string {
  return network === "egress"
    ? "- Network: outbound through an allowlist proxy (package registries " +
        "work; arbitrary hosts may be refused — report a refused host " +
        "instead of retrying it)."
    : "- Network: NONE. Package installs and web requests from the sandbox " +
        "will fail — do not retry them; use your tools for external data " +
        "and prebaked libraries (httpx, requests, zod) for code.";
}
