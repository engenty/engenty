// The two cards `agent_remove` parks on. A hired (custom) specialist is
// DELETED — row, routines, own workflows, every mount; a module agent is only
// REMOVED from this Space and can be added back. The card says which.
import { createRequestDecisionArtifact } from "@engenty/ai-core";
import type { NamedRef } from "../../src/ai/registry/delete-agent.js";

export type AgentRemoveMode = "delete" | "unmount";

function listLine(label: string, refs: readonly NamedRef[]): string {
  return `- **${label}:** ${
    refs.length > 0 ? refs.map((ref) => ref.name).join(", ") : "none"
  }`;
}

export function agentDeleteDecisionArtifact(input: {
  agentId: string;
  name: string;
  routines: readonly NamedRef[];
  spaces: readonly NamedRef[];
  workflows: readonly NamedRef[];
}) {
  return createRequestDecisionArtifact({
    title: `Delete ${input.name}?`,
    body: [
      `${input.name} (\`${input.agentId}\`) will be **deleted — this cannot be undone**. Deleted with it:`,
      "",
      listLine("Routines", input.routines),
      listLine("Its own workflows", input.workflows),
      listLine("Unmounted from Spaces", input.spaces),
      "",
      "Records, files and tasks it wrote stay.",
    ].join("\n"),
    choices: [
      {
        id: "approve",
        label: "Delete",
        description: "Delete the agent, its routines and its own workflows.",
      },
      { id: "reject", label: "Keep", description: "Change nothing." },
    ],
  });
}

export function agentUnmountDecisionArtifact(input: {
  agentId: string;
  name: string;
  routines: readonly NamedRef[];
}) {
  return createRequestDecisionArtifact({
    title: `Remove ${input.name} from this Space?`,
    body: [
      `${input.name} (\`${input.agentId}\`) comes with its module. It will be **removed from this Space — it can be added back**; the agent itself stays available.`,
      "",
      listLine("Routines paused here", input.routines),
      "- **Its open tasks here:** unassigned",
      "",
      "Records and files stay.",
    ].join("\n"),
    choices: [
      {
        id: "approve",
        label: "Remove",
        description: "Remove it from this Space and pause its routines here.",
      },
      { id: "reject", label: "Keep", description: "Change nothing." },
    ],
  });
}
