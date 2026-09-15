// The one line that tells an agent WHY its workspace is thinner than its
// instructions promise. The mount table fails closed — `/data` and `/space`
// are dropped when the run's Space is unresolved, `/skills` lists nothing —
// which is right, and which read to the agent (and to the person watching)
// exactly like "this Space has no files and no skills". Naming the missing
// mounts and the reason turns a silent gap into a sentence the agent can say.

import type { DroppedWorkspaceMount } from "../workspace/workspace-presets.js";
import type { RunSpaceResolution } from "./run-space.js";

function joinPaths(paths: readonly string[]): string {
  const unique = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  if (unique.length <= 1) {
    return unique.join("");
  }
  return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

/**
 * The `your_workspace` runtime line, or null when nothing is missing that the
 * agent would otherwise misread. Binding drops (`/task` on a chat with no
 * task, `/project` above it) are the ordinary shape of a run and stay out;
 * the tenant `/shared` a confined run loses is explained by its instructions.
 */
export function formatWorkspaceMountNote(input: {
  dropped: readonly DroppedWorkspaceMount[];
  resolution: RunSpaceResolution | undefined;
}): string | null {
  const noSpace = input.dropped
    .filter((mount) => mount.reason === "no_space")
    .map((mount) => mount.path);
  const unresolved = input.resolution?.kind === "unresolved";
  if (noSpace.length === 0 && !unresolved) {
    return null;
  }
  const why = unresolved
    ? "this run's Space could not be resolved"
    : "this run has no Space";
  const parts: string[] = [];
  if (noSpace.length > 0) {
    const verb = new Set(noSpace).size === 1 ? "is" : "are";
    parts.push(`${joinPaths(noSpace)} ${verb} not mounted (${why})`);
  }
  if (unresolved) {
    parts.push(
      noSpace.length > 0
        ? "and /skills lists no skills for the same reason"
        : `/skills lists no skills (${why})`
    );
  }
  return `- your_workspace: ${parts.join(" ")}. Say so if asked for files, records or skills — do not report the Space as empty, and do not treat the missing mounts as a capability you lack.`;
}
