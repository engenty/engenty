/**
 * The space Data tree, server side (PLAN-space-data.md D2/D3/D5).
 *
 * Module adapters never bypass the operation pipeline: every call they make
 * goes through {@link invokeOperation} with the CALLER's principal.
 *
 * Mount = grant gets its fourth reader here. A module's root is listed if and
 * only if the module is mounted in the space, the mount's `record_scope` is one
 * the adapter can honour, and — for a non-human principal — `agent_access` is
 * not `none`. `alwaysVisible` skips the mount check for space-native roots.
 * Hiding alone would be decoration, so the capability wall inside
 * `invokeOperation` still decides for module roots; this only stops the tree
 * from advertising what the caller could never open.
 *
 * Markdown pages are `ai.artifact` rows (mixed into Artifacts / Ablage), not a
 * module adapter. Knowledge Base is a mounted-module root over `module_kb`.
 */

import { isApiError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import type {
  SpaceDataAdapter,
  SpaceDataArchiveEntry,
  SpaceDataContext,
  SpaceDataDocument,
  SpaceDataListing,
  SpaceDataRecordScope,
} from "@engenty/plugin-sdk";
import {
  archiveDocumentEntries,
  archiveFolderEntry,
  isPluginOperationError,
  spaceDataPathSegments,
} from "@engenty/plugin-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AuthUnavailableError } from "../../dal/core-users/auth.js";
import { findAccessibleSpace } from "../../dal/space-membership.js";
import {
  listSpaceMounts,
  type SpaceAgentAccess,
} from "../../dal/space-mounts.js";
import { createDatabaseAdapter } from "../../infra/index.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import type { PrincipalContext } from "../../security/auth.js";
import type { AuthProvider } from "../../security/auth-provider.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import {
  InvokeOperationError,
  invokeOperation,
} from "./plugins/module-operation-routes.js";

type ApprovalService = ReturnType<typeof createApprovalService>;
/** Mirrors module-operation-routes' own (unexported) resolver shape. */
type TenantPluginOverrideResolver = (
  tenantId: string
) => Promise<Record<string, boolean>>;

/** See spaces-routes: a non-user principal is a member of nothing. */
const NIL_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Export bounds.
 *
 * An export walks real list operations, so "the whole space" has to have a
 * ceiling — and when it hits one the archive SAYS so. A silently half-written
 * archive is worse than none: it looks like a backup right up until someone
 * restores from it.
 */
const EXPORT_MAX_DEPTH = 4;
const EXPORT_MAX_ENTRIES = 5000;

interface RouteContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    param: (name: string) => string;
    query: (key: string) => string | undefined;
  };
}

const writeBodySchema = z.object({
  base_version: z.string(),
  content: z.string(),
  encoding: z.enum(["base64", "utf8"]).optional(),
  member: z.string().optional(),
  path: z.string().min(1),
});

const importBodySchema = z.object({
  base_version: z.string().optional(),
  content: z.string(),
  path: z.string().min(1),
});

export const createBodySchema = z.object({
  content: z.string().optional(),
  encoding: z.enum(["base64", "utf8"]).optional(),
  kind: z.enum(["folder", "node"]),
  name: z.string().trim().min(1),
  node_type: z.string().optional(),
  /** A FULL tree path, root included — `Files` creates at the root itself. */
  parent_path: z.string().min(1),
});

/**
 * A move needs a destination, and a rename IS a move that kept its parent.
 *
 * Refusing the empty case here rather than in each adapter keeps "move nothing
 * anywhere" from reaching a module as a successful no-op, which is the shape
 * that makes a caller believe it moved something.
 */
export const deleteBodySchema = z.object({
  base_version: z.string().optional(),
  path: z.string().min(1),
  /**
   * Explicit, and defaulting to FALSE.
   *
   * A cascade is the most destructive thing this tree can do — for a file
   * space it takes the children and their bytes — so it happens because a
   * caller asked for it in this request, never because a default made it
   * convenient.
   */
  recursive: z.boolean().optional().default(false),
});

export const moveBodySchema = z
  .object({
    base_version: z.string().optional(),
    new_name: z.string().trim().min(1).optional(),
    path: z.string().min(1),
    to_parent_path: z.string().min(1).optional(),
  })
  .refine(
    (body) => body.new_name !== undefined || body.to_parent_path !== undefined,
    { message: "Provide to_parent_path and/or new_name" }
  );

export interface SpaceDataRoutesParams {
  app: OpenAPIHono;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  authProvider: AuthProvider;
  config: Record<string, unknown>;
  dataDir: string;
  getTenantDb?: ((auth: { tenantId: string }) => SupabaseClient) | null;
  registry: PluginRegistry;
  resolvePath: (p: string) => string;
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
}

/**
 * One root of the tree, as the client sees it.
 *
 * `writable` is the ADAPTER's answer ("this module has a write mapping at
 * all"), not the caller's — whether this particular caller may write is
 * decided by the operation's own policy when they try, and pre-computing it
 * here would mean two authorities that can disagree.
 */
/**
 * What this module's face SUPPORTS, delivered before the click (P3.1).
 *
 * The same information a 405 would have carried, sent early — so the tree can
 * hide or disable an action instead of offering one that fails. This is the UI
 * counterpart of the rule the invoices adapter already follows: a protocol that
 * only finds out by trying teaches its callers to retry.
 *
 * Rename is deliberately NOT its own flag. In this protocol a rename IS a move
 * that kept its parent, so a separate `canRename` would imply the two can
 * differ and invite an adapter to make them.
 */
export interface SpaceDataCapabilitiesDto {
  canCreate: boolean;
  canDelete: boolean;
  /** Covers rename, which is a move that kept its parent. */
  canMove: boolean;
  canWrite: boolean;
}

export interface SpaceDataRootDto {
  /** What the adapter supports, so actions are gated before the click. */
  capabilities: SpaceDataCapabilitiesDto;
  label: string;
  moduleId: string;
  nodeTypes: SpaceDataAdapter["nodeTypes"];
  recordScope: SpaceDataRecordScope;
  root: string;
  /** The adapter's own type for its root folder, where it declared one. */
  rootNodeType?: string;
  writable: boolean;
}

function capabilitiesOf(adapter: SpaceDataAdapter): SpaceDataCapabilitiesDto {
  return {
    canCreate: Boolean(adapter.createNode),
    canDelete: Boolean(adapter.deleteNode),
    canMove: Boolean(adapter.moveNode),
    canWrite: Boolean(adapter.write),
  };
}

/**
 * The roots a caller may see in one space.
 *
 * Pure so the mount = grant rule is testable without a database or an HTTP
 * request — the negative test the plan asks for (an unmounted module shows
 * nothing) asserts against THIS, not against the UI.
 */
export function resolveVisibleSpaceDataRoots(input: {
  adapters: readonly SpaceDataAdapter[];
  /** True for agent/service principals; humans are gated by capabilities only. */
  isAutonomous: boolean;
  mounts: ReadonlyArray<{
    agentAccess: SpaceAgentAccess | null;
    recordScope: SpaceDataRecordScope | null;
    resourceKey: string;
    resourceType: string;
  }>;
}): Array<{ adapter: SpaceDataAdapter; root: SpaceDataRootDto }> {
  const byModule = new Map(
    input.mounts
      .filter((mount) => mount.resourceType === "module")
      .map((mount) => [mount.resourceKey, mount])
  );
  const visible: Array<{ adapter: SpaceDataAdapter; root: SpaceDataRootDto }> =
    [];
  for (const adapter of input.adapters) {
    const mount = byModule.get(adapter.moduleId);
    if (!(mount || adapter.alwaysVisible)) {
      // Not mounted: the module's records are not part of this space. Records
      // themselves never move — this hides, it does not delete.
      continue;
    }
    if (
      input.isAutonomous &&
      mount &&
      (mount.agentAccess ?? "none") === "none"
    ) {
      // A mount that closed agent_access still hides the root from agents.
      // alwaysVisible without a mount is space-native — agents in the space
      // may see it.
      continue;
    }
    // An undecided `record_scope` means the whole tenant library, which is what
    // a mount without a chosen scope has always meant elsewhere. An
    // always-visible root with no mount uses the same default.
    const recordScope: SpaceDataRecordScope = mount?.recordScope ?? "all";
    if (!adapter.recordScopes.includes(recordScope)) {
      // The mount asks for a narrowing this module cannot express (contacts and
      // offers carry no space_id by design). Hiding is the honest answer;
      // widening to "all" would silently overrule the mount.
      continue;
    }
    visible.push({
      adapter,
      root: {
        capabilities: capabilitiesOf(adapter),
        label: adapter.label,
        moduleId: adapter.moduleId,
        nodeTypes: adapter.nodeTypes,
        recordScope,
        root: adapter.root,
        writable: Boolean(adapter.write),
        ...(adapter.rootNodeType ? { rootNodeType: adapter.rootNodeType } : {}),
      },
    });
  }
  return visible.sort((a, b) => a.root.root.localeCompare(b.root.root));
}

/**
 * Re-root everything an adapter hands back onto FULL tree paths.
 *
 * An adapter speaks paths relative to its own root — it should not have to
 * repeat "Contacts/" into every row — but the HTTP boundary must speak ONE
 * path language, and it has to be the one its own endpoints accept. Returning
 * `draft/relaunch__<id>.offer` from a read and then requiring
 * `Offers/draft/relaunch__<id>.offer` on the write is an invitation for every
 * client to reassemble it, and the first one that forgets gets a 404 naming a
 * folder called `draft`. (It was the UI. That is why this function exists.)
 */
function absolutePath(root: string, relative: string): string {
  return relative ? `${root}/${relative}` : root;
}

function rootedListing(
  root: string,
  listing: SpaceDataListing
): SpaceDataListing {
  return {
    ...listing,
    entries: listing.entries.map((entry) => ({
      ...entry,
      path: absolutePath(root, entry.path),
    })),
    folders: listing.folders.map((folder) => ({
      ...folder,
      path: absolutePath(root, folder.path),
    })),
    ...(listing.self
      ? {
          self: {
            ...listing.self,
            path: absolutePath(root, listing.self.path),
          },
        }
      : {}),
  };
}

function rootedDocument(
  root: string,
  document: SpaceDataDocument
): SpaceDataDocument {
  return { ...document, path: absolutePath(root, document.path) };
}

/**
 * Split `Contacts/acme.contact.md` into its root and the adapter-relative rest.
 *
 * **Validates before splitting.** `spaceDataPathSegments` throws on `..` and
 * `.`, and it has to run HERE rather than in each adapter: contacts and offers
 * happen to be safe because both match paths against a fixed folder list, but
 * that is their business logic, not a boundary. An adapter that maps a path to
 * a storage key or a filesystem path would inherit a traversal hole from an
 * author who simply did not think to check — and "every adapter remembers" is
 * not a security property. One gate, before dispatch.
 */
export function splitSpaceDataPath(path: string): {
  relativePath: string;
  root: string;
} {
  const segments = spaceDataPathSegments(path);
  return {
    relativePath: segments.slice(1).join("/"),
    root: segments[0] ?? "",
  };
}

export function registerSpaceDataRoutes(params: SpaceDataRoutesParams) {
  const { app, config, registry } = params;

  function db(tenantId: string) {
    if (params.getTenantDb) {
      return params.getTenantDb({ tenantId });
    }
    const client = createDatabaseAdapter(config);
    if (!client) {
      throw new Error("space_data_routes_requires_database");
    }
    return client;
  }

  /**
   * The caller, as the operation pipeline will see them.
   *
   * The FULL principal (not the route-auth summary): an agent's `agentId` is
   * what makes `evaluatePolicy` escalate a gated write to an approval instead
   * of allowing it, and losing it here would quietly let agents write records
   * without a card.
   */
  async function requirePrincipal(
    c: RouteContext
  ): Promise<{ error: Response } | { auth: PrincipalContext }> {
    let resolved: PrincipalContext | null;
    try {
      resolved = await params.authProvider.resolvePrincipal(
        c.req.header("authorization")
      );
    } catch (error) {
      if (error instanceof AuthUnavailableError) {
        return {
          error: jsonApiError(c, 503, {
            message: "Authentication service unavailable — please retry.",
          }),
        };
      }
      throw error;
    }
    if (!resolved) {
      return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
    }
    if (!resolved.tenantId) {
      return { error: jsonApiError(c, 403, { message: "No tenant" }) };
    }
    const headerAgentId = c.req.header("x-engenty-agent-id");
    const headerGoalId = c.req.header("x-engenty-goal-id");
    return {
      auth: {
        ...resolved,
        agentId:
          resolved.principalType === "agent"
            ? resolved.principalId
            : (headerAgentId ?? resolved.agentId),
        goalId: headerGoalId ?? resolved.goalId,
      },
    };
  }

  /** A space the caller may not enter is 404, never 403 (see spaces-routes). */
  async function requireSpace(c: RouteContext, auth: PrincipalContext) {
    const subject =
      auth.principalType === "user" && auth.principalId
        ? auth.principalId
        : NIL_USER_ID;
    const space = await findAccessibleSpace(
      db(auth.tenantId),
      auth.tenantId,
      subject,
      c.req.param("spaceId")
    );
    return space
      ? { space }
      : { error: jsonApiError(c, 404, { message: "Space not found" }) };
  }

  function adapters(): SpaceDataAdapter[] {
    return (registry.spaceDataAdapters ?? []).map((entry) => entry.adapter);
  }

  async function visibleRoots(auth: PrincipalContext, spaceId: string) {
    const mounts = await listSpaceMounts(
      db(auth.tenantId),
      auth.tenantId,
      spaceId
    );
    return resolveVisibleSpaceDataRoots({
      adapters: adapters(),
      isAutonomous: auth.principalType !== "user",
      mounts,
    });
  }

  /**
   * The adapter context: one `invokeOperation` bound to this caller.
   *
   * Everything an adapter can do to the database it does through here, so the
   * adapter's authority is exactly the caller's — never the server's.
   */
  function adapterContext(
    auth: PrincipalContext,
    spaceId: string,
    recordScope: SpaceDataRecordScope
  ): SpaceDataContext {
    return {
      invokeOperation: async (operationId, input) => {
        const result = await invokeOperation({
          approvalService: params.approvalService,
          auditLog: params.auditLog,
          auth: { ...auth, spaceId },
          config,
          dataDir: params.dataDir,
          input,
          operationId,
          registry,
          resolvePath: params.resolvePath,
          ...(params.resolveTenantPluginOverrides
            ? {
                resolveTenantPluginOverrides:
                  params.resolveTenantPluginOverrides,
              }
            : {}),
        });
        return result.data;
      },
      recordScope,
      spaceId,
      tenantId: auth.tenantId,
    };
  }

  /**
   * Resolve a tree path to the adapter that owns it, or fail the request.
   *
   * A path whose first segment names no VISIBLE root is 404 — the same answer
   * a made-up folder gets, and the same reason spaces are 404 rather than 403:
   * "this module exists but is not mounted here" is information the caller has
   * no claim to.
   */
  async function resolveTarget(
    c: RouteContext,
    auth: PrincipalContext,
    spaceId: string,
    path: string
  ) {
    let relativePath: string;
    let root: string;
    try {
      ({ relativePath, root } = splitSpaceDataPath(path));
    } catch (error) {
      // A refused path is an ANSWER (400 `invalid_data_path`), not a crash —
      // and the same paths arrive from an agent's `write_file`.
      return { error: adapterFailure(c, error) };
    }
    const match = (await visibleRoots(auth, spaceId)).find(
      (entry) => entry.root.root === root
    );
    if (!match) {
      return {
        error: jsonApiError(c, 404, {
          message: `No data folder "${root}" in this space.`,
        }),
      };
    }
    return {
      adapter: match.adapter,
      ctx: adapterContext(auth, spaceId, match.root.recordScope),
      relativePath,
      root: match.root,
    };
  }

  /**
   * Adapter failures, answered rather than crashed.
   *
   * A 409 from the version check, a 400 from a derived member, a 202 approval
   * gate raised inside `invokeOperation` — all are ANSWERS the caller acts on,
   * and a 500 would tell them (and every retry policy in between) that the
   * server broke instead.
   */
  function adapterFailure(c: RouteContext, error: unknown): Response {
    if (error instanceof InvokeOperationError) {
      const raw = error.body;
      if (isApiError(raw)) {
        return c.json(raw, error.status);
      }
      const record =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const messageFromBody =
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : typeof record.reason === "string" && record.reason.trim()
            ? record.reason
            : error.message;
      return jsonApiError(c, error.status, {
        message: messageFromBody,
        ...(typeof record.code === "string" ? { code: record.code } : {}),
        ...(record.details === undefined ? {} : { details: record.details }),
      });
    }
    if (isPluginOperationError(error)) {
      return jsonApiError(c, error.status, {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    throw error;
  }

  app.get("/api/spaces/:spaceId/data/roots", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const roots = await visibleRoots(principal.auth, access.space.id);
    return jsonApiSuccess(
      c,
      roots.map((entry) => entry.root)
    );
  });

  app.get("/api/spaces/:spaceId/data/list", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      c.req.query("path") ?? ""
    );
    if ("error" in target) {
      return target.error;
    }
    try {
      const listing = {
        // On every listing, not just the roots call: a client that opened a
        // folder three levels down should not have to have kept the roots
        // response around to know whether it may add something here.
        capabilities: target.root.capabilities,
        ...rootedListing(
          target.root.root,
          await target.adapter.list(target.ctx, target.relativePath)
        ),
      };
      return jsonApiSuccess(
        c,
        target.relativePath || listing.self
          ? listing
          : {
              // The ROOT describes itself from what the adapter already
              // declared. Asking every adapter to hand back its own root row
              // would be asking them to repeat `label` and `rootNodeType` into
              // a listing whose whole job is the level below.
              ...listing,
              self: {
                name: target.root.label,
                path: target.root.root,
                ...(target.root.rootNodeType
                  ? { nodeType: target.root.rootNodeType }
                  : {}),
              },
            }
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  app.get("/api/spaces/:spaceId/data/read", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const path = c.req.query("path") ?? "";
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.relativePath) {
      return jsonApiError(c, 400, {
        message: "A data read needs a path inside the folder.",
      });
    }
    try {
      return jsonApiSuccess(
        c,
        rootedDocument(
          target.root.root,
          await target.adapter.read(target.ctx, target.relativePath)
        )
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  app.put("/api/spaces/:spaceId/data/write", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const parsed = writeBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Invalid write body",
        details: { issues: parsed.error.issues },
      });
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      parsed.data.path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.adapter.write) {
      return jsonApiError(c, 405, {
        message: `${target.root.label} is read-only in the data tree.`,
      });
    }
    try {
      return jsonApiSuccess(
        c,
        rootedDocument(
          target.root.root,
          await target.adapter.write(target.ctx, {
            baseVersion: parsed.data.base_version,
            content: parsed.data.content,
            path: target.relativePath,
            ...(parsed.data.encoding ? { encoding: parsed.data.encoding } : {}),
            ...(parsed.data.member ? { member: parsed.data.member } : {}),
          })
        )
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  /**
   * Make a folder or a node (P1.1/P1.2).
   *
   * `parent_path` is a full tree path so the ONE path language rule holds for
   * writes too: the caller sends back exactly what a listing handed them. The
   * root itself is a legal parent — `Files` means "at the top of Files".
   */
  app.post("/api/spaces/:spaceId/data/create", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const parsed = createBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Invalid create body",
        details: { issues: parsed.error.issues },
      });
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      parsed.data.parent_path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.adapter.createNode) {
      return jsonApiError(c, 405, {
        code: "not_supported",
        message: `Nothing new can be made in ${target.root.label} from the data tree — use the module's own action.`,
      });
    }
    // The NAME is validated here, as a path segment would be, because the
    // adapter is about to mint a path out of it. A name carrying a slash or a
    // `..` is a traversal attempt wearing a display field.
    try {
      spaceDataPathSegments(parsed.data.name);
    } catch (error) {
      return adapterFailure(c, error);
    }
    if (parsed.data.name.includes("/")) {
      return jsonApiError(c, 400, {
        code: "invalid_data_path",
        message: "A name is one path segment — it cannot contain a slash.",
      });
    }
    try {
      return jsonApiSuccess(
        c,
        rootedDocument(
          target.root.root,
          await target.adapter.createNode(target.ctx, {
            kind: parsed.data.kind,
            name: parsed.data.name,
            parentPath: target.relativePath,
            ...(parsed.data.content === undefined
              ? {}
              : { content: parsed.data.content }),
            ...(parsed.data.encoding ? { encoding: parsed.data.encoding } : {}),
            ...(parsed.data.node_type
              ? { nodeType: parsed.data.node_type }
              : {}),
          })
        )
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  /**
   * Remove one node (P1.1/P1.2).
   *
   * `DELETE` with a body, because the base version and the recursive flag are
   * both part of what is being asked and neither belongs in a query string
   * where a proxy might log it or a retry might drop it.
   *
   * The danger is entirely the adapter's to price: core checks the path and
   * dispatches, and the owning module's operation carries the risk level that
   * decides whether an agent gets an approval card first.
   */
  app.delete("/api/spaces/:spaceId/data/delete", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const parsed = deleteBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Invalid delete body",
        details: { issues: parsed.error.issues },
      });
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      parsed.data.path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.relativePath) {
      // The ROOT is the module's presence in the space, and it is removed by
      // unmounting the module — not by deleting a folder.
      return jsonApiError(c, 400, {
        message: `${target.root.label} is removed from this space by unmounting the module, not by deleting the folder.`,
      });
    }
    if (!target.adapter.deleteNode) {
      return jsonApiError(c, 405, {
        code: "not_supported",
        message: `Nothing in ${target.root.label} is deleted from the data tree — removing a record is the module's own action.`,
      });
    }
    try {
      return jsonApiSuccess(
        c,
        await target.adapter.deleteNode(target.ctx, {
          path: target.relativePath,
          recursive: parsed.data.recursive,
          ...(parsed.data.base_version
            ? { baseVersion: parsed.data.base_version }
            : {}),
        })
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  /**
   * Move and/or rename one node (P1.1/P1.2).
   *
   * **A move stays inside one root.** Crossing roots is not a slow move, it is
   * a different operation entirely — a contact dragged into `Files/` would have
   * to stop being a contact — so it is refused by name rather than attempted.
   * Both paths are resolved through `resolveTarget`, so an invisible
   * destination is the same 404 an invisible source is.
   */
  app.post("/api/spaces/:spaceId/data/move", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const parsed = moveBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Invalid move body",
        details: { issues: parsed.error.issues },
      });
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      parsed.data.path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.relativePath) {
      return jsonApiError(c, 400, {
        message: "A data move needs a path inside the folder.",
      });
    }
    if (!target.adapter.moveNode) {
      return jsonApiError(c, 405, {
        code: "not_supported",
        message: `Nothing in ${target.root.label} moves from the data tree — where a record sits is the module's own field.`,
      });
    }
    let toParentPath: string | undefined;
    if (parsed.data.to_parent_path !== undefined) {
      const destination = await resolveTarget(
        c,
        principal.auth,
        access.space.id,
        parsed.data.to_parent_path
      );
      if ("error" in destination) {
        return destination.error;
      }
      if (destination.root.root !== target.root.root) {
        return jsonApiError(c, 400, {
          code: "cross_root_move",
          message: `A move stays inside one folder tree — ${target.root.label} and ${destination.root.label} are different modules.`,
        });
      }
      toParentPath = destination.relativePath;
    }
    if (parsed.data.new_name?.includes("/")) {
      return jsonApiError(c, 400, {
        code: "invalid_data_path",
        message: "A name is one path segment — it cannot contain a slash.",
      });
    }
    try {
      return jsonApiSuccess(
        c,
        rootedDocument(
          target.root.root,
          await target.adapter.moveNode(target.ctx, {
            path: target.relativePath,
            ...(parsed.data.base_version
              ? { baseVersion: parsed.data.base_version }
              : {}),
            ...(parsed.data.new_name ? { newName: parsed.data.new_name } : {}),
            ...(toParentPath === undefined ? {} : { toParentPath }),
          })
        )
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });

  /**
   * The whole tree, written down (D5).
   *
   * Export is not a format — it is the tree as files: a folder becomes a
   * directory with an `index.md`, a record becomes its own file, a bundle
   * becomes a directory of its source members. That is decision 3 paying off:
   * because a folder is `directory + index` everywhere, exporting is just
   * writing the shape somewhere else, and importing is reading it back.
   *
   * Bounded by the same depth and node caps the agent walk uses, and it SAYS
   * when it stopped — an archive that silently omits half a module's records
   * would be worse than no archive at all.
   */
  app.get("/api/spaces/:spaceId/data/export", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const roots = await visibleRoots(principal.auth, access.space.id);
    const only = c.req.query("root");
    const entries: SpaceDataArchiveEntry[] = [];
    let truncated = false;
    for (const { adapter, root } of roots) {
      if (only && only !== root.root) {
        continue;
      }
      const ctx = adapterContext(
        principal.auth,
        access.space.id,
        root.recordScope
      );
      const queue: Array<{ depth: number; path: string }> = [
        { depth: 0, path: root.root },
      ];
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) {
          break;
        }
        if (entries.length >= EXPORT_MAX_ENTRIES) {
          truncated = true;
          break;
        }
        let listing: Awaited<ReturnType<typeof adapter.list>>;
        try {
          listing = await adapter.list(
            ctx,
            next.path.split("/").slice(1).join("/")
          );
        } catch {
          continue;
        }
        if (listing.truncated) {
          truncated = true;
        }
        for (const folder of listing.folders) {
          const path = `${root.root}/${folder.path}`;
          entries.push(archiveFolderEntry({ folder, path }));
          if (next.depth < EXPORT_MAX_DEPTH) {
            queue.push({ depth: next.depth + 1, path });
          }
        }
        for (const entry of listing.entries) {
          const path = `${root.root}/${entry.path}`;
          try {
            const document = await adapter.read(ctx, entry.path);
            entries.push(...archiveDocumentEntries({ document, path }));
          } catch {
            // One unreadable record does not fail the export; the tree is a
            // view over stores that fail separately and so is its archive.
            truncated = true;
          }
        }
      }
    }
    return jsonApiSuccess(c, {
      entries,
      exportedAt: new Date().toISOString(),
      spaceId: access.space.id,
      ...(truncated ? { truncated: true } : {}),
    });
  });

  /**
   * Bulk import of a collection view (D5).
   *
   * A separate endpoint from `write` on purpose: one save here can mean
   * hundreds of record writes, and that must never look like saving a file.
   * The adapter reports created/updated/failed counts, which is what the
   * approval card and the UI both show.
   */
  app.post("/api/spaces/:spaceId/data/import", async (c) => {
    const principal = await requirePrincipal(c);
    if ("error" in principal) {
      return principal.error;
    }
    const access = await requireSpace(c, principal.auth);
    if ("error" in access) {
      return access.error;
    }
    const parsed = importBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonApiError(c, 400, {
        message: "Invalid import body",
        details: { issues: parsed.error.issues },
      });
    }
    const target = await resolveTarget(
      c,
      principal.auth,
      access.space.id,
      parsed.data.path
    );
    if ("error" in target) {
      return target.error;
    }
    if (!target.adapter.importCollection) {
      return jsonApiError(c, 405, {
        message: `${target.root.label} has no bulk import.`,
      });
    }
    try {
      return jsonApiSuccess(
        c,
        await target.adapter.importCollection(target.ctx, {
          content: parsed.data.content,
          path: target.relativePath,
          ...(parsed.data.base_version
            ? { baseVersion: parsed.data.base_version }
            : {}),
        })
      );
    } catch (error) {
      return adapterFailure(c, error);
    }
  });
}
