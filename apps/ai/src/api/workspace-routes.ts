// `/ai/registry/agents/:id/workspace` — admin-facing read/write into an agent's
// declarative workspace mounts WITHOUT starting a run. The GET view exposes the
// full mount topology (incl. run-bound `/task`, `/sandbox` marked unavailable).
//
// File ops go through the same Files SDK client the agent runtime uses
// (createWorkspaceFilesClient), scoped to the mount's tenant prefix. Listing uses
// the SDK's `delimiter: "/"` common-prefix support so folders come back natively
// (no provider-specific folder-marker guessing). Paths are mount-relative.
//
// Editing gate: writes/deletes are rejected on `ro` mounts (e.g. `/skills`); the
// route is the enforcement point, not the UI.

import type { Files } from "files-sdk";
import type { Context, Hono } from "hono";

import type { AgentConfig, AiRegistry } from "../ai/registry/types.js";
import { createWorkspaceFilesClient } from "../ai/workspace/workspace-fs-provider.js";
import {
  type AgentWorkspaceView,
  findMountView,
  resolveAgentWorkspaceView,
  type WorkspaceMountView,
} from "../ai/workspace/workspace-view.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RegistryStore } from "../dal/registry/index.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterWorkspaceRoutesOptions {
  getRegistry?: (tenantId: string) => AiRegistry;
  getStore: () => RegistryStore | null;
  scopeResolver: AiScopeResolver;
}

interface WorkspaceContext {
  tenantId: string;
  view: AgentWorkspaceView;
}

interface WorkspaceListEntry {
  is_dir: boolean;
  name: string;
  path: string;
  size: number | null;
  updated_at: string | null;
}

async function loadConfig(
  options: RegisterWorkspaceRoutesOptions,
  tenantId: string,
  agentId: string
): Promise<AgentConfig | undefined> {
  const registry = options.getRegistry?.(tenantId);
  if (registry) {
    return registry.getAgentConfig(agentId);
  }
  return options.getStore()?.getAgentConfig(tenantId, agentId);
}

/** Shared prelude: resolve scope, load agent config, resolve workspace view. */
async function loadWorkspaceContext(
  c: Context,
  options: RegisterWorkspaceRoutesOptions
): Promise<
  { ok: true; ctx: WorkspaceContext } | { ok: false; response: Response }
> {
  const resolved = await resolveScope(c, options.scopeResolver);
  if (!resolved.ok) {
    return { ok: false, response: resolved.response };
  }
  const { tenantId, userId } = resolved.scope;
  const agentId = c.req.param("id");
  if (!agentId) {
    return {
      ok: false,
      response: c.json({ error: "agent_workspace.notFound" }, 404),
    };
  }
  const config = await loadConfig(options, tenantId, agentId);
  if (!config) {
    return {
      ok: false,
      response: c.json({ error: "agent_workspace.notFound" }, 404),
    };
  }
  const view = resolveAgentWorkspaceView(config, { agentId, tenantId, userId });
  if (!view) {
    return {
      ok: false,
      response: c.json({ error: "workspace.notConfigured" }, 404),
    };
  }
  return { ok: true, ctx: { tenantId, view } };
}

/** Files SDK client scoped to the mount's tenant-relative prefix. */
function mountFilesClient(tenantId: string, mount: WorkspaceMountView): Files {
  return createWorkspaceFilesClient({
    fileStorageRelativePath: mount.storagePrefix ?? "",
    tenantId,
  });
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "NotFound"
  );
}

function toIsoOrNull(lastModified: number | undefined): string | null {
  return typeof lastModified === "number"
    ? new Date(lastModified).toISOString()
    : null;
}

function baseName(key: string): string {
  return key.replace(/\/+$/, "").split("/").pop() ?? key;
}

/** Reject path traversal and absolute paths; normalize to a clean relative path. */
function sanitizeRelativePath(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().replace(/^\/+/, "");
  if (value.length === 0) {
    return "";
  }
  if (value.split("/").some((segment) => segment === "..")) {
    return null;
  }
  return value;
}

function resolveMount(
  view: AgentWorkspaceView,
  mountPath: string | undefined
): { ok: true; mount: WorkspaceMountView } | { ok: false; error: string } {
  if (!mountPath) {
    return { ok: false, error: "workspace.mountRequired" };
  }
  const mount = findMountView(view, mountPath);
  if (!mount) {
    return { ok: false, error: "workspace.mountNotFound" };
  }
  if (!mount.browsable) {
    return { ok: false, error: "workspace.mountUnavailable" };
  }
  return { ok: true, mount };
}

/** Resolve mount + relative path + scoped Files client, or a 4xx response. */
function resolveTarget(
  c: Context,
  ctx: WorkspaceContext,
  mountPath: string | undefined,
  rawPath: string | undefined,
  requirePath: boolean
):
  | { ok: true; mount: WorkspaceMountView; path: string; files: Files }
  | { ok: false; response: Response } {
  const mountResult = resolveMount(ctx.view, mountPath);
  if (!mountResult.ok) {
    return { ok: false, response: c.json({ error: mountResult.error }, 400) };
  }
  const path = sanitizeRelativePath(rawPath);
  if (path === null || (requirePath && path === "")) {
    return {
      ok: false,
      response: c.json({ error: "workspace.invalidPath" }, 400),
    };
  }
  const files = mountFilesClient(ctx.tenantId, mountResult.mount);
  return { ok: true, mount: mountResult.mount, path, files };
}

export function registerWorkspaceRoutes(
  app: Hono<any>,
  options: RegisterWorkspaceRoutesOptions
) {
  const base = `${AI_BASE_PATH}/registry/agents/:id/workspace`;

  // Resolved workspace view (mount topology + config), no run required.
  app.get(base, async (c) => {
    const loaded = await loadWorkspaceContext(c, options);
    if (!loaded.ok) {
      return loaded.response;
    }
    return c.json({ workspace: loaded.ctx.view });
  });

  // Full recursive file list for a mount (flat — the UI builds + caches the
  // nested tree). Paginates the Files SDK listing up to a sane cap.
  app.get(`${base}/tree`, async (c) => {
    const loaded = await loadWorkspaceContext(c, options);
    if (!loaded.ok) {
      return loaded.response;
    }
    try {
      const target = resolveTarget(
        c,
        loaded.ctx,
        c.req.query("mount"),
        "",
        false
      );
      if (!target.ok) {
        return target.response;
      }
      const entries: WorkspaceListEntry[] = [];
      let cursor: string | undefined;
      do {
        const result = await target.files.list({ limit: 1000, cursor });
        for (const item of result.items) {
          entries.push({
            name: baseName(item.key),
            path: item.key,
            is_dir: false,
            size: item.size ?? null,
            updated_at: toIsoOrNull(item.lastModified),
          });
        }
        cursor = result.cursor;
      } while (cursor && entries.length < 5000);

      entries.sort((a, b) => a.path.localeCompare(b.path));
      return c.json({
        read_only: target.mount.access === "ro",
        files: entries,
        truncated: Boolean(cursor),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list workspace tree",
        "agent_workspace.internalError",
        err
      );
    }
  });

  // Read a single file's text content.
  app.get(`${base}/file`, async (c) => {
    const loaded = await loadWorkspaceContext(c, options);
    if (!loaded.ok) {
      return loaded.response;
    }
    try {
      const target = resolveTarget(
        c,
        loaded.ctx,
        c.req.query("mount"),
        c.req.query("path"),
        true
      );
      if (!target.ok) {
        return target.response;
      }
      const stored = await target.files.download(target.path);
      return c.json({
        path: target.path,
        content: await stored.text(),
        read_only: target.mount.access === "ro",
      });
    } catch (err) {
      if (isNotFoundError(err)) {
        return c.json({ error: "workspace.fileNotFound" }, 404);
      }
      return handleRouteError(
        c,
        "failed to read workspace file",
        "agent_workspace.internalError",
        err
      );
    }
  });

  // Write (upsert) a file. Rejected on read-only mounts.
  app.put(`${base}/file`, async (c) => {
    const loaded = await loadWorkspaceContext(c, options);
    if (!loaded.ok) {
      return loaded.response;
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        content?: string;
        mount?: string;
        path?: string;
      };
      const target = resolveTarget(c, loaded.ctx, body.mount, body.path, true);
      if (!target.ok) {
        return target.response;
      }
      if (target.mount.access === "ro") {
        return c.json({ error: "workspace.mountReadOnly" }, 409);
      }
      await target.files.upload(target.path, body.content ?? "", {
        contentType: "text/plain; charset=utf-8",
      });
      return c.json({ path: target.path });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to write workspace file",
        "agent_workspace.internalError",
        err
      );
    }
  });

  // Delete a file. Rejected on read-only mounts.
  app.delete(`${base}/file`, async (c) => {
    const loaded = await loadWorkspaceContext(c, options);
    if (!loaded.ok) {
      return loaded.response;
    }
    try {
      const target = resolveTarget(
        c,
        loaded.ctx,
        c.req.query("mount"),
        c.req.query("path"),
        true
      );
      if (!target.ok) {
        return target.response;
      }
      if (target.mount.access === "ro") {
        return c.json({ error: "workspace.mountReadOnly" }, 409);
      }
      await target.files.delete(target.path);
      return c.json({ deleted: true, path: target.path });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete workspace file",
        "agent_workspace.internalError",
        err
      );
    }
  });
}
