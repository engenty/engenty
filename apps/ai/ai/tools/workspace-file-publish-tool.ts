// `workspace_file_publish`: one file from the run's computer into the Space's
// folder, stored now, with the storage key in the answer.
//
// Files in `/space` reach storage at the run's end; files in `/sandbox` on a
// Space computer never do. A page the agent opens mid-run (the import wizard
// with `?file=<storage_key>`) needs the key while the conversation is still
// going, so this stores the one file straight away. The bytes go from the
// host to storage — the model only names the path.
//
// A file already under `/space` is stored where it is. Anything else is copied
// to the agent's `work/` folder first (`/space/agent/<agent>/work/<name>`), so
// the file the person opens is also the one the Data tab and the computer show.

import {
  fileStorageSpaceObjectKey,
  SPACE_AGENT_FOLDER,
  spaceAgentFolderPath,
} from "@engenty/file-storage";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../src/ai/workspace/core-file-storage-client.js";
import { SPACE_MOUNT_PATH } from "../../src/ai/workspace/workspace-presets.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export const WORKSPACE_FILE_PUBLISH_TOOL_ID = "workspace_file_publish";

/** Same ceiling as a chat attachment. */
const MAX_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

/** `/space/a/b.csv` → `["a", "b.csv"]`; null outside `/space` or on `..`. */
function spaceRelativeSegments(path: string): string[] | null {
  if (!path.startsWith(`${SPACE_MOUNT_PATH}/`)) {
    return null;
  }
  const segments = path
    .slice(SPACE_MOUNT_PATH.length + 1)
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) {
    return null;
  }
  return segments;
}

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "File name when the file is copied into your work folder; defaults to its own name."
    ),
  path: z
    .string()
    .min(1)
    .describe(
      "Absolute path on your computer, e.g. /sandbox/contacts-fixed.csv or /space/public/contacts.csv."
    ),
});

export const workspaceFilePublishTool = createTool({
  id: WORKSPACE_FILE_PUBLISH_TOOL_ID,
  description:
    "Store one file from your computer in the Space now and get its storage_key — " +
    "for a page that opens a stored file, e.g. open_view with `?file=<storage_key>&name=<name>`. " +
    `A file under /space is stored where it is; any other is copied to /space/${SPACE_AGENT_FOLDER}/<you>/work/ first. ` +
    "The file is uploaded from the computer; do not read it into the chat first. Max 25 MB.",
  inputSchema,
  execute: async (input, context) => {
    const filesystem = context?.workspace?.filesystem;
    if (!filesystem) {
      return { error: "This run has no computer.", ok: false };
    }
    const run = getEngentyToolsRunContext();
    const spaceId = run.space?.spaceId;
    const agentKey = run.agentTypeKey;
    const coreBaseUrl = run.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    if (
      !(run.tenantId && spaceId && agentKey && run.accessToken && coreBaseUrl)
    ) {
      return {
        error: "This run has no Space to store the file in.",
        ok: false,
      };
    }
    let bytes: Buffer;
    try {
      const content = await filesystem.readFile(input.path);
      bytes = typeof content === "string" ? Buffer.from(content) : content;
    } catch (error) {
      return {
        error: `Could not read ${input.path}: ${error instanceof Error ? error.message : String(error)}`,
        ok: false,
      };
    }
    if (bytes.byteLength > MAX_BYTES) {
      return { error: "File is larger than 25 MB.", ok: false };
    }

    let segments = spaceRelativeSegments(input.path);
    if (!segments) {
      const name = safeName(
        input.name ?? input.path.split("/").pop() ?? "file"
      );
      segments = [...spaceAgentFolderPath(agentKey, "work").split("/"), name];
      // Onto the computer too, so the stored file and /space agree.
      await filesystem.writeFile(
        `${SPACE_MOUNT_PATH}/${segments.join("/")}`,
        bytes
      );
    }
    const name = segments.at(-1) ?? "file";
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const storageKey = fileStorageSpaceObjectKey(
      run.tenantId,
      spaceId,
      "ai",
      "workspace",
      "commons",
      ...segments
    );
    await createEngentyCoreFileStorageClient({
      accessToken: run.accessToken,
      coreBaseUrl,
    }).upload(storageKey, new Uint8Array(bytes), {
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
    });
    return {
      name,
      ok: true,
      path: `${SPACE_MOUNT_PATH}/${segments.join("/")}`,
      size: bytes.byteLength,
      storage_key: storageKey,
    };
  },
});
