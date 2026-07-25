import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createAppsRepoSupabase } from "../dal/supabase.js";
import { callApp } from "../domain/call-service.js";
import {
  approveRelease,
  proposeRelease,
  rejectRelease,
  rollbackRelease,
} from "../domain/release-service.js";
import type { AppHostClient } from "../lib/app-host-client.js";
import { appManifestSchema } from "../schema/zod.js";
import {
  appActionsListInputSchema,
  appActionsListResultSchema,
  appCallInputSchema,
  appCallResultSchema,
  appCreateInputSchema,
  appDataExportInputSchema,
  appDataExportResultSchema,
  appDataGetInputSchema,
  appDataListInputSchema,
  appDataListResultSchema,
  appDataSetInputSchema,
  appDetailSchema,
  appFileWriteInputSchema,
  appIdParamsSchema,
  appListQuerySchema,
  appReleaseDecisionInputSchema,
  appReleaseProposeInputSchema,
  appSchema,
  appVersionSchema,
} from "../schema/zod.js";

export type AppsRepo = ReturnType<typeof createAppsRepoSupabase>;

export type RepoOrFactory =
  | AppsRepo
  | ((
      auth: PluginAuthContext,
      recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
    ) => AppsRepo);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext,
  recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
): AppsRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth, recordAuditEvent);
  }
  return repoOrFactory;
}

const MODULE_ID = "engenty-apps";

const readOp = () => ({
  dryRunSupported: false,
  idempotent: true,
  moduleId: MODULE_ID,
  requiredCapabilities: ["module.engenty-apps.read"],
  requiresApproval: false,
  riskLevel: "low" as const,
});

const writeOp = () => ({
  dryRunSupported: false,
  idempotent: false,
  moduleId: MODULE_ID,
  requiredCapabilities: ["module.engenty-apps.write"],
  requiresApproval: true,
  riskLevel: "high" as const,
});

/**
 * Release activation is gated on its own capability rather than on tenant
 * admin, so a department lead can sign off on their own department's app
 * without holding "*". `apps.approve` is not covered by the `module.*` bundle
 * that ordinary members hold, so it has to be granted explicitly. It needs no
 * separate registration: the capability catalog is derived from these
 * operation contracts (apps/core/src/api/routes/authz-routes.ts).
 */
const approveOp = () => ({
  dryRunSupported: false,
  idempotent: false,
  moduleId: MODULE_ID,
  requiredCapabilities: ["apps.approve"],
  // This operation IS the human approval act; it must not itself require one.
  requiresApproval: false,
  riskLevel: "high" as const,
});

export interface AppsGatewayOptions {
  /** Client for apps/app-host. Absent ⇒ build/call operations fail loudly. */
  appHost?: AppHostClient | null;
}

function tenantOf(ctx: { auth?: PluginAuthContext | null }): string {
  const tenantId = ctx.auth?.tenantId;
  if (!tenantId) {
    throw new Error("tenant_required");
  }
  return tenantId;
}

export function registerAppsGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  options?: AppsGatewayOptions
): void {
  const appHost = options?.appHost ?? null;

  // ── Discovery ────────────────────────────────────────────────────────────

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const filter = appListQuerySchema.parse(input ?? {});
      const apps = await repo.listApps(filter);
      return { apps };
    },
    inputSchema: appListQuerySchema,
    operationId: "app_list",
    outputSchema: z.object({ apps: z.array(appSchema) }),
    summary: "List apps in this tenant",
  });

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = appIdParamsSchema.parse(input);
      const app = await repo.getApp(params.id);
      if (!app) {
        throw new Error("app_not_found");
      }
      const activeVersion = app.active_version_id
        ? await repo.getVersion(app.active_version_id)
        : null;
      return { ...app, active_version: activeVersion };
    },
    inputSchema: appIdParamsSchema,
    operationId: "app_get",
    outputSchema: appDetailSchema,
    summary: "Get an app and its active version",
  });

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = appActionsListInputSchema.parse(input);
      const app = await repo.getApp(params.app_id);
      if (!app) {
        throw new Error("app_not_found");
      }
      const version = app.active_version_id
        ? await repo.getVersion(app.active_version_id)
        : null;
      return {
        actions: version?.manifest.actions ?? [],
        app_id: params.app_id,
        operations: version?.manifest.engenty.operations ?? [],
        version: version?.version ?? null,
      };
    },
    inputSchema: appActionsListInputSchema,
    operationId: "app_actions_list",
    outputSchema: appActionsListResultSchema,
    summary: "List the actions and engenty operations an app declares",
  });

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = appIdParamsSchema.parse(input);
      const versions = await repo.listVersions(params.id);
      return { versions };
    },
    inputSchema: appIdParamsSchema,
    operationId: "app_versions_list",
    outputSchema: z.object({ versions: z.array(appVersionSchema) }),
    summary: "List an app's versions, newest first",
  });

  // ── Authoring ────────────────────────────────────────────────────────────

  api.registerOperation({
    ...writeOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appCreateInputSchema.parse(input);
      const existing = await repo.getAppBySlug(parsed.slug);
      if (existing) {
        throw new Error("app_slug_taken");
      }
      return await repo.createApp(
        {
          description: parsed.description ?? null,
          name: parsed.name,
          slug: parsed.slug,
        },
        {
          createdBy:
            parsed.created_by_agent_type_key ?? ctx.auth?.principalId ?? null,
          kind: parsed.created_by_agent_type_key ? "agent" : "user",
        }
      );
    },
    inputSchema: appCreateInputSchema,
    operationId: "app_create",
    outputSchema: appSchema,
    summary: "Create an app",
  });

  api.registerOperation({
    ...writeOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appFileWriteInputSchema.parse(input);
      const app = await repo.getApp(parsed.app_id);
      if (!app) {
        throw new Error("app_not_found");
      }
      if (app.status === "archived") {
        throw new Error("app_archived");
      }

      const draft = await repo.getOrCreateDraftVersion(parsed.app_id, {
        createdBy: ctx.auth?.principalId ?? null,
        kind: "agent",
      });

      // Merge rather than replace: an author writes one file at a time.
      const files = { ...draft.files, ...parsed.files };
      const manifest = parsed.manifest
        ? appManifestSchema.parse(parsed.manifest)
        : draft.manifest;

      const updated = await repo.updateVersion(draft.id, { files, manifest });
      if (!updated) {
        throw new Error("app_version_not_found");
      }
      return updated;
    },
    inputSchema: appFileWriteInputSchema,
    operationId: "app_file_write",
    outputSchema: appVersionSchema,
    summary: "Write source files into an app's draft version",
  });

  api.registerOperation({
    ...writeOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appReleaseProposeInputSchema.parse(input);
      const result = await proposeRelease(
        { appHost, repo, tenantId: tenantOf(ctx) },
        { appId: parsed.app_id }
      );
      return result.version;
    },
    inputSchema: appReleaseProposeInputSchema,
    operationId: "app_release_propose",
    outputSchema: appVersionSchema,
    summary: "Build the current draft and propose it for approval",
  });

  // ── Governance ───────────────────────────────────────────────────────────

  api.registerOperation({
    ...approveOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appReleaseDecisionInputSchema.parse(input);
      const result = await approveRelease(
        { appHost, repo, tenantId: tenantOf(ctx) },
        { appId: parsed.app_id, version: parsed.version }
      );
      ctx.recordAuditEvent?.({
        detail: { app_id: parsed.app_id, version: parsed.version },
        type: "engenty_apps.release_approved",
      });
      return result.version;
    },
    inputSchema: appReleaseDecisionInputSchema,
    operationId: "app_release_approve",
    outputSchema: appVersionSchema,
    summary: "Activate a proposed app version",
  });

  api.registerOperation({
    ...approveOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appReleaseDecisionInputSchema.parse(input);
      const version = await rejectRelease(
        { appHost, repo, tenantId: tenantOf(ctx) },
        {
          appId: parsed.app_id,
          reason: parsed.reason,
          version: parsed.version,
        }
      );
      ctx.recordAuditEvent?.({
        detail: { app_id: parsed.app_id, version: parsed.version },
        type: "engenty_apps.release_rejected",
      });
      return version;
    },
    inputSchema: appReleaseDecisionInputSchema,
    operationId: "app_release_reject",
    outputSchema: appVersionSchema,
    summary: "Reject a proposed app version, leaving the active one live",
  });

  api.registerOperation({
    ...approveOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appReleaseDecisionInputSchema.parse(input);
      const result = await rollbackRelease(
        { appHost, repo, tenantId: tenantOf(ctx) },
        { appId: parsed.app_id, version: parsed.version }
      );
      ctx.recordAuditEvent?.({
        detail: { app_id: parsed.app_id, version: parsed.version },
        type: "engenty_apps.release_rolled_back",
      });
      return result.version;
    },
    inputSchema: appReleaseDecisionInputSchema,
    operationId: "app_release_rollback",
    outputSchema: appVersionSchema,
    summary: "Redeploy a previous version from its stored source",
  });

  api.registerOperation({
    ...approveOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = appIdParamsSchema.parse(input);
      const app = await repo.updateApp(params.id, { status: "archived" });
      if (!app) {
        throw new Error("app_not_found");
      }
      ctx.recordAuditEvent?.({
        detail: { app_id: params.id },
        type: "engenty_apps.app_archived",
      });
      return app;
    },
    inputSchema: appIdParamsSchema,
    operationId: "app_archive",
    outputSchema: appSchema,
    summary: "Archive an app — the per-app kill switch",
  });

  // ── Invocation ───────────────────────────────────────────────────────────

  api.registerOperation({
    ...readOp(),
    // A declared low-risk action. `callApp` refuses anything the manifest
    // marks high-risk or approval-requiring, so this operation can never be
    // used to slip a privileged action past the approval flow.
    requiredCapabilities: ["module.engenty-apps.read"],
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appCallInputSchema.parse(input);
      return await callApp(
        { appHost, repo, tenantId: tenantOf(ctx) },
        {
          action: parsed.action,
          appId: parsed.app_id,
          capability: parsed.capability,
          input: parsed.input,
          sessionId: parsed.session_id,
        },
        { allowPrivileged: false }
      );
    },
    inputSchema: appCallInputSchema,
    operationId: "app_call",
    outputSchema: appCallResultSchema,
    summary: "Invoke a low-risk action on an app",
  });

  api.registerOperation({
    ...writeOp(),
    // The privileged twin. Its contract carries requiresApproval, so a
    // headless coordinator run hitting it pauses into the existing durable
    // approval flow (allow once / for this task / for this routine) with no
    // new machinery.
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appCallInputSchema.parse(input);
      const result = await callApp(
        { appHost, repo, tenantId: tenantOf(ctx) },
        {
          action: parsed.action,
          appId: parsed.app_id,
          capability: parsed.capability,
          input: parsed.input,
          sessionId: parsed.session_id,
        },
        { allowPrivileged: true }
      );
      ctx.recordAuditEvent?.({
        detail: { action: parsed.action, app_id: parsed.app_id },
        type: "engenty_apps.privileged_action_called",
      });
      return result;
    },
    inputSchema: appCallInputSchema,
    operationId: "app_call_privileged",
    outputSchema: appCallResultSchema,
    summary: "Invoke a high-risk app action (approval-gated)",
  });

  // ── App working data ─────────────────────────────────────────────────────
  //
  // These read and write the App's OWN scratch store, never tenant business
  // data — that only moves through the operations the manifest declares. So
  // they are low risk and un-gated: prompting a human for every keystroke of
  // an app's working state would train people to click approve.

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appDataGetInputSchema.parse(input);
      const entry = await repo.getData({
        appId: parsed.app_id,
        key: parsed.key,
        sessionId: parsed.session_id,
      });
      return {
        key: parsed.key,
        updated_at: entry?.updated_at ?? "",
        value: entry?.value ?? null,
      };
    },
    inputSchema: appDataGetInputSchema,
    operationId: "app_data_get",
    outputSchema: z.object({
      key: z.string(),
      updated_at: z.string(),
      value: z.unknown(),
    }),
    summary: "Read one key from an app's working store",
  });

  api.registerOperation({
    ...readOp(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appDataListInputSchema.parse(input);
      const entries = await repo.listData({
        appId: parsed.app_id,
        prefix: parsed.prefix,
        sessionId: parsed.session_id,
      });
      return {
        entries: entries.map((entry) => ({
          key: entry.key,
          updated_at: entry.updated_at,
          value: entry.value,
        })),
      };
    },
    inputSchema: appDataListInputSchema,
    operationId: "app_data_list",
    outputSchema: appDataListResultSchema,
    summary: "List an app session's working-store keys",
  });

  api.registerOperation({
    ...readOp(),
    idempotent: false,
    requiredCapabilities: ["module.engenty-apps.write"],
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appDataSetInputSchema.parse(input);
      const entry = await repo.setData({
        appId: parsed.app_id,
        key: parsed.key,
        sessionId: parsed.session_id,
        value: parsed.value ?? null,
      });
      return {
        key: entry.key,
        updated_at: entry.updated_at,
        value: entry.value,
      };
    },
    inputSchema: appDataSetInputSchema,
    operationId: "app_data_set",
    outputSchema: z.object({
      key: z.string(),
      updated_at: z.string(),
      value: z.unknown(),
    }),
    summary: "Write one key into an app's working store",
  });

  api.registerOperation({
    ...readOp(),
    idempotent: false,
    requiredCapabilities: ["module.engenty-apps.write"],
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appDataGetInputSchema.parse(input);
      await repo.deleteData({
        appId: parsed.app_id,
        key: parsed.key,
        sessionId: parsed.session_id,
      });
      return { deleted: true };
    },
    inputSchema: appDataGetInputSchema,
    operationId: "app_data_delete",
    outputSchema: z.object({ deleted: z.boolean() }),
    summary: "Delete one key from an app's working store",
  });

  api.registerOperation({
    ...writeOp(),
    // App working data sits outside the search index and outside anything
    // that reports on tenant data, so an explicit export is how it stays
    // retrievable — see PLAN-engenty-apps.md §9.4.
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = appDataExportInputSchema.parse(input);
      const entries = await repo.listAllData(parsed.app_id, parsed.session_id);
      return {
        app_id: parsed.app_id,
        entries: entries.map((entry) => ({
          key: entry.key,
          session_id: entry.session_id,
          updated_at: entry.updated_at,
          value: entry.value,
        })),
        exported_at: new Date().toISOString(),
      };
    },
    inputSchema: appDataExportInputSchema,
    operationId: "app_data_export",
    outputSchema: appDataExportResultSchema,
    summary: "Export an app's working store",
  });
}
