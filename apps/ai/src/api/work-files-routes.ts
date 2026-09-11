// `GET /ai/work-files?container=<tier>:<id>` — list the workspace files that
// live under a container's resolved prefixes (task/routine/project/global).
// The file counterpart to the artifact container list: same resolver, different
// medium (the files bucket instead of ai.artifact).
import type { WorkContainerTier } from "@engenty/file-storage";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import { createScopeModuleOperationInvoker } from "../ai/sessions/task-workspace-hook.js";
import { scopeAccessToken } from "../ai/sessions/types.js";
import { resolveTenantDefaultSpaceId } from "../ai/work-scope/resolve-space.js";
import { resolveWorkContainer } from "../ai/work-scope/resolve-work-container.js";
import { createEngentyCoreFileStorageClient } from "../ai/workspace/core-file-storage-client.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const containerTierSchema = z.enum([
  "thread",
  "task",
  "routine",
  "project",
  "space",
  "global",
]);

/** Cap files listed per prefix — keep the response small (this is a browse aid). */
const MAX_FILES_PER_PREFIX = 100;

interface WorkFileEntry {
  filename: string;
  key: string;
  prefix: string;
  size_bytes: number | null;
  updated_at: string | null;
}

function parseContainer(
  raw: string
): { tier: WorkContainerTier | "thread"; id: string } | null {
  const idx = raw.indexOf(":");
  const tierRaw = idx === -1 ? raw : raw.slice(0, idx);
  const id = idx === -1 ? "" : raw.slice(idx + 1).trim();
  const tier = containerTierSchema.safeParse(tierRaw.trim());
  if (!tier.success) {
    return null;
  }
  if (tier.data === "global") {
    return { tier: "global", id: id || "global" };
  }
  if (!id) {
    return null;
  }
  return { tier: tier.data, id };
}

export function registerWorkFilesRoutes(
  app: Hono<any>,
  options: { scopeResolver: AiScopeResolver }
): void {
  const base = `${AI_BASE_PATH}/work-files`;

  app.get(base, async (c: Context) => {
    const scope = await resolveScope(c, options.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const containerRaw = c.req.query("container");
    if (!containerRaw) {
      return c.json({ error: "work_files.containerRequired" }, 400);
    }
    const ref = parseContainer(containerRaw);
    if (!ref) {
      return c.json({ error: "work_files.invalidContainer" }, 400);
    }
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    const accessToken = scopeAccessToken(scope.scope)?.trim();
    if (!(coreBaseUrl && accessToken)) {
      return c.json({ error: "work_files.unconfigured" }, 503);
    }
    try {
      const invoke = createScopeModuleOperationInvoker(scope.scope);
      const resolved = await resolveWorkContainer(
        {
          invoke,
          spaceId: await resolveTenantDefaultSpaceId(scope.scope.tenantId),
          tenantId: scope.scope.tenantId,
        },
        ref
      );
      const client = createEngentyCoreFileStorageClient({
        bucket: "files",
        coreBaseUrl,
        accessToken,
      });
      const entries: WorkFileEntry[] = [];
      for (const prefix of resolved.workspacePrefixes) {
        const files = await client.list(prefix, {
          limit: MAX_FILES_PER_PREFIX,
        });
        for (const file of files) {
          // Hide dotfiles — e.g. the ".keep" markers every task checkout
          // writes to materialize its folders. `workspacePrefixes` still
          // carries the folder itself, so an empty folder stays addressable.
          if (file.filename.startsWith(".")) {
            continue;
          }
          entries.push({
            filename: file.filename,
            key: file.key,
            prefix,
            size_bytes: file.size_bytes ?? null,
            updated_at: file.updated_at ?? null,
          });
        }
      }
      return c.json({ prefixes: resolved.workspacePrefixes, entries });
    } catch (err) {
      return handleRouteError(
        c,
        "listWorkFiles failed",
        "work_files.listFailed",
        err
      );
    }
  });
}
