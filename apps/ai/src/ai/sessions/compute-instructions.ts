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
      ? "- $HOME (/opt/sandbox) and /sandbox persist and are shared with the Space's other agents: installs, " +
        "CLI logins and dotfiles go there and stay. Say what you installed. " +
        "Skills and MCP servers an installer writes there reach no one " +
        "until offered: call computer_skills_find and " +
        "connector_import_request after it runs. A CLI that signs in " +
        "through a browser (`<cli> login`): run it with background: true, " +
        "then call browser_sign_in with the URL it prints."
      : "- Nothing on this computer outlasts it — $HOME is a small scratch. " +
        "Anything worth keeping goes to your mounted folders.",
    "- System paths are read-only and there is no sudo: install into $HOME " +
      "or /sandbox (`npx`, `uvx`, a project's `npm install` or `uv venv`), " +
      "never `npm install -g`.",
    networkLine(input.network),
    "- `engenty tools list`, `engenty tools schema <id>` and " +
      "`engenty tools call <id> --input '<json>'` (or `@file.json`) call " +
      "Engenty operations from the shell, with the same permissions as " +
      "engenty_tool_execute — pipe them through jq and loop in bash. " +
      "Exit 2 means the write needs approval: call engenty_tools_preapprove, " +
      "then run it again.",
    "- Package caches are warm per Space — a second install of the same " +
      "package is fast.",
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
    "/company/spaces/<key>/ what each Space published. To add to the drive " +
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
        `- Execution: this Space's computer (${TOOLCHAIN}) — the Space named ` +
        "in current_space. One container shared with the Space's other " +
        "agents and kept between runs, so commands may briefly queue behind " +
        "theirs. Each Space has its own computer: after the conversation " +
        "moves to another Space, a different $HOME and /sandbox are expected, " +
        "not a lost one."
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
