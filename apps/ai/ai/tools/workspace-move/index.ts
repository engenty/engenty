/**
 * `workspace_move` and `workspace_copy` (PLAN-space-data-agent-crud P1.6).
 *
 * Mastra 1.59's workspace tool set has read, write, edit, list, delete, stat,
 * mkdir and grep — and **no move and no copy at all**. The filesystem layer
 * underneath has `moveFile` and `copyFile`; the gap is exactly one layer thick.
 *
 * Doing it our side rather than patching `@mastra/core` buys the thing that
 * makes it worth having: **these work ACROSS MOUNTS**. `Workspace.filesystem`
 * is a composite, and a single filesystem's `moveFile` cannot express
 * two named mount paths because the paths can belong to different providers.
 * Read-then-write across the composite can. Which mounts exist is decided per
 * run; the tool must not imply that a particular pair is always present.
 *
 * A folder move is a bounded batch, not an atomic rename: object storage has no
 * rename, so the tool walks, copies and removes, and it REPORTS what it did
 * including truncation. A batch that silently stopped at 100 files would look
 * exactly like a batch that finished.
 */

import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { requireFilesystem } from "@mastra/core/workspace";
import { z } from "zod";

/**
 * How many files one folder move or copy may touch.
 *
 * Bounded because each entry is a real read and a real write through whatever
 * provider owns it — for `/data` that is a module operation per file. The cap
 * is reported rather than silent (see the module comment).
 */
const MAX_BATCH = 200;

const moveInputSchema = z.object({
  destination: z
    .string()
    .min(1)
    .describe(
      "Absolute destination path on a named mount exposed in this run. It may be on a different mount than the source."
    ),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace the destination if it already exists."),
  source: z
    .string()
    .min(1)
    .describe("Absolute source path on a named mount exposed in this run."),
});

const copyInputSchema = z.object({
  destination: z
    .string()
    .min(1)
    .describe("Absolute workspace path to copy TO."),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace the destination if it already exists."),
  source: z.string().min(1).describe("Absolute workspace path to copy."),
});

interface TransferResult {
  copied: number;
  /** True when the walk hit MAX_BATCH and stopped; the caller is TOLD. */
  truncated: boolean;
}

type Filesystem = ReturnType<typeof requireFilesystem>["filesystem"];

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

async function assertVacant(
  filesystem: Filesystem,
  path: string,
  overwrite: boolean
): Promise<void> {
  if (overwrite) {
    return;
  }
  if (await filesystem.exists(path)) {
    throw new Error(
      `"${path}" already exists. Pass overwrite: true to replace it.`
    );
  }
}

/**
 * Copy one file or one directory tree across the composite filesystem.
 *
 * Read + write rather than the provider's own `copyFile`, because source and
 * destination may live on different providers — which is the point of the tool.
 */
async function copyTree(
  filesystem: Filesystem,
  source: string,
  destination: string,
  overwrite: boolean
): Promise<TransferResult> {
  const stat = await filesystem.stat(source);
  if (stat.type === "file") {
    await assertVacant(filesystem, destination, overwrite);
    const content = await filesystem.readFile(source);
    await filesystem.writeFile(destination, content);
    return { copied: 1, truncated: false };
  }

  let copied = 0;
  const queue: Array<{ from: string; to: string }> = [
    { from: source, to: destination },
  ];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      break;
    }
    await filesystem.mkdir(next.to, { recursive: true });
    for (const entry of await filesystem.readdir(next.from)) {
      if (copied >= MAX_BATCH) {
        return { copied, truncated: true };
      }
      const from = joinPath(next.from, entry.name);
      const to = joinPath(next.to, entry.name);
      if (entry.type === "directory") {
        queue.push({ from, to });
        continue;
      }
      await assertVacant(filesystem, to, overwrite);
      await filesystem.writeFile(to, await filesystem.readFile(from));
      copied += 1;
    }
  }
  return { copied, truncated: false };
}

export const workspaceMoveTool = createTool({
  id: "workspace_move",
  description:
    "Move or rename a workspace file or folder. Use only named mounts exposed in this run. Source and destination may be on different available mounts, which the built-in file tools cannot handle. A folder move copies then removes up to 200 files and reports if it stopped early.",
  inputSchema: moveInputSchema,
  outputSchema: z.object({
    destination: z.string(),
    moved: z.number(),
    source: z.string(),
    truncated: z.boolean(),
  }),
  execute: async (input, context) => {
    const { filesystem } = requireFilesystem(
      context as unknown as ToolExecutionContext
    );
    const { destination, overwrite, source } = moveInputSchema.parse(input);
    const result = await copyTree(
      filesystem,
      source,
      destination,
      overwrite ?? false
    );
    // Remove the source ONLY after the copy succeeded, and only when the copy
    // was complete: deleting the origin of a truncated move would destroy the
    // files that did not make it.
    if (!result.truncated) {
      const stat = await filesystem.stat(source);
      if (stat.type === "directory") {
        await filesystem.rmdir(source, { recursive: true });
      } else {
        await filesystem.deleteFile(source);
      }
    }
    return {
      destination,
      moved: result.copied,
      source,
      truncated: result.truncated,
    };
  },
});

export const workspaceCopyTool = createTool({
  id: "workspace_copy",
  description:
    "Copy a workspace file or folder, leaving the original in place. Use only named mounts exposed in this run; source and destination may be on different available mounts. A folder copy handles up to 200 files and reports if it stopped early.",
  inputSchema: copyInputSchema,
  outputSchema: z.object({
    copied: z.number(),
    destination: z.string(),
    source: z.string(),
    truncated: z.boolean(),
  }),
  execute: async (input, context) => {
    const { filesystem } = requireFilesystem(
      context as unknown as ToolExecutionContext
    );
    const { destination, overwrite, source } = copyInputSchema.parse(input);
    const result = await copyTree(
      filesystem,
      source,
      destination,
      overwrite ?? false
    );
    return {
      copied: result.copied,
      destination,
      source,
      truncated: result.truncated,
    };
  },
});

export const workspaceTransferTools = {
  workspace_copy: workspaceCopyTool,
  workspace_move: workspaceMoveTool,
};
