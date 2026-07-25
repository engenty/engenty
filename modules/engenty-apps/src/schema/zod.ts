import { z } from "@hono/zod-openapi";

/**
 * The manifest is the App's declared capability surface, and it is the ONLY
 * thing that widens what an App may do. Everything here is deny-by-default:
 * an operation that is not listed cannot be invoked, a host that is not listed
 * cannot be reached, an action that is not listed cannot be called.
 */

export const appActionSchema = z.object({
  /** Path inside the app backend, without the leading slash. */
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{0,63}$/,
      "action id must be lowercase alphanumerics/hyphens"
    ),
  requiresApproval: z.boolean().optional(),
  risk: z.enum(["low", "high"]),
  summary: z.string().min(1).max(400),
});

/** A relative path inside the App. No absolute paths, no traversal. */
const appFilePathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-/]+$/,
    "file path must be relative, without .. segments"
  );

export const appManifestSchema = z.object({
  actions: z.array(appActionSchema).max(64).default([]),
  /**
   * Deny-all by default (decision 2026-07-25). An App reaches the outside
   * world through declared engenty operations, not through raw fetch.
   */
  egress: z
    .object({ connect: z.array(z.string()).max(16).default([]) })
    .default({ connect: [] }),
  engenty: z
    .object({ operations: z.array(z.string()).max(64).default([]) })
    .default({ operations: [] }),
  entry: z.object({
    backend: appFilePathSchema.optional(),
    frontend: appFilePathSchema,
  }),
  name: z.string().min(1).max(120),
  rules: appFilePathSchema.optional(),
  storage: z
    .object({
      config: z.boolean().default(false),
      data: z.boolean().default(false),
    })
    .default({ config: false, data: false }),
});

export const appSchema = z.object({
  active_version_id: z.string().uuid().nullable(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  created_by_kind: z.enum(["agent", "user"]),
  description: z.string().nullable(),
  id: z.string().uuid(),
  name: z.string(),
  scope_id: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  tenant_id: z.string().uuid(),
  updated_at: z.string(),
});

export const appVersionSchema = z.object({
  app_id: z.string().uuid(),
  build_log: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  created_by_kind: z.enum(["agent", "user"]),
  deployed_at: z.string().nullable(),
  files: z.record(z.string(), z.string()),
  /** The built document, for Apps whose entry names sources rather than HTML. */
  frontend_html: z.string().nullable(),
  id: z.string().uuid(),
  manifest: appManifestSchema,
  release: z.string().nullable(),
  scope_id: z.string(),
  status: z.enum(["proposed", "active", "archived"]),
  tenant_id: z.string().uuid(),
  version: z.number().int(),
});

export const appDetailSchema = appSchema.extend({
  active_version: appVersionSchema.nullable(),
});

export const appIdParamsSchema = z.object({ id: z.string().uuid() });

export const appListQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const appCreateInputSchema = z.object({
  created_by_agent_type_key: z.string().optional(),
  description: z.string().max(2000).nullish(),
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{1,62}$/,
      "slug must be lowercase alphanumerics/hyphens, 2-63 chars"
    ),
});

export const appFileWriteInputSchema = z.object({
  app_id: z.string().uuid(),
  /**
   * Merged into the draft version's file map. Writing an empty string deletes
   * nothing — pass the full desired content per path.
   */
  files: z.record(appFilePathSchema, z.string().max(400_000)),
  manifest: appManifestSchema.optional(),
});

export const appReleaseProposeInputSchema = z.object({
  app_id: z.string().uuid(),
  /** Free-text note shown to whoever approves the release. */
  note: z.string().max(1000).optional(),
});

export const appReleaseDecisionInputSchema = z.object({
  app_id: z.string().uuid(),
  reason: z.string().max(1000).optional(),
  version: z.number().int().positive(),
});

export const appCallInputSchema = z.object({
  action: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "unknown action id format"),
  app_id: z.string().uuid(),
  /** Opaque capability handle, when the caller is an App backend. */
  capability: z.string().max(200).optional(),
  input: z.unknown().optional(),
  session_id: z.string().max(200).optional(),
});

export const appCallResultSchema = z.object({
  action: z.string(),
  app_id: z.string().uuid(),
  output: z.unknown(),
  status: z.number().int(),
});

export const appActionsListInputSchema = z.object({
  app_id: z.string().uuid(),
});

export const appActionsListResultSchema = z.object({
  actions: z.array(appActionSchema),
  app_id: z.string().uuid(),
  operations: z.array(z.string()),
  version: z.number().int().nullable(),
});

const appDataKeySchema = z.string().min(1).max(200);

export const appDataGetInputSchema = z.object({
  app_id: z.string().uuid(),
  key: appDataKeySchema,
  session_id: z.string().min(1).max(200),
});

export const appDataSetInputSchema = appDataGetInputSchema.extend({
  value: z.unknown(),
});

export const appDataListInputSchema = z.object({
  app_id: z.string().uuid(),
  prefix: z.string().max(200).optional(),
  session_id: z.string().min(1).max(200),
});

export const appDataEntrySchema = z.object({
  key: z.string(),
  updated_at: z.string(),
  value: z.unknown(),
});

export const appDataListResultSchema = z.object({
  entries: z.array(appDataEntrySchema),
});

export const appDataExportInputSchema = z.object({
  app_id: z.string().uuid(),
  session_id: z.string().max(200).optional(),
});

export const appDataExportResultSchema = z.object({
  app_id: z.string().uuid(),
  entries: z.array(
    appDataEntrySchema.extend({ session_id: z.string() })
  ),
  exported_at: z.string(),
});

/**
 * App config. Unlike `app_data` there is no session_id — that is the point:
 * config is what an App remembers about a tenant or a user between artifact
 * instances. `user_id` selects the level (omitted ⇒ the tenant-wide default).
 */
export const appConfigGetInputSchema = z.object({
  app_id: z.string().uuid(),
  key: appDataKeySchema,
  user_id: z.string().uuid().optional(),
});

export const appConfigSetInputSchema = appConfigGetInputSchema.extend({
  value: z.unknown(),
});

export const appConfigListInputSchema = z.object({
  app_id: z.string().uuid(),
  prefix: z.string().max(200).optional(),
  user_id: z.string().uuid().optional(),
});

export const appConfigEntrySchema = z.object({
  key: z.string(),
  /** Which level the returned value actually came from. */
  scope: z.enum(["default", "user"]),
  updated_at: z.string(),
  value: z.unknown(),
});

export const appConfigListResultSchema = z.object({
  entries: z.array(appConfigEntrySchema),
});

export const notFoundSchema = z.object({ error: z.string() });

export type AppManifestInput = z.input<typeof appManifestSchema>;
